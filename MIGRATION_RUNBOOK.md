# getfluxo.io - Migration & Secrets Runbook

## Overview

This runbook documents:
1. **Schema-per-tenant migration strategy** - Moving from shared tables to dedicated tenant schemas
2. **Zero-downtime migration patterns** - Adding columns, constraints, indexes without downtime
3. **Secrets management** - AWS Secrets Manager + External Secrets Operator integration
4. **Tenant provisioning** - Creating new tenant schemas with full schema and RLS setup

## 1. Schema-per-Tenant Migration (Staged Approach)

### Phase 1: Preparation (Staging)

```bash
# 1. Create backup/snapshot
aws rds create-db-snapshot \
  --db-instance-identifier getfluxo-prod \
  --db-snapshot-identifier getfluxo-pre-migration-$(date +%s)

# 2. Test migration on staging copy
DATABASE_URL=postgresql://...staging... \
  bash packages/fengine/scripts/migrate-tenant.sh create inst_test_001
```

### Phase 2: Create New Tenant Schema (Zero-downtime)

```bash
# 1. Create new schema in parallel (does not lock existing tables)
DATABASE_URL=postgresql://...prod... \
  bash packages/fengine/scripts/migrate-tenant.sh create inst_001

# 2. Verify schema created
kubectl exec -it postgres-pod -- psql -U postgres -d getfluxo \
  -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"
```

### Phase 3: Backfill Data in Batches (No Locking)

```bash
# 1. Backfill data with batching (safe for large tables)
BATCH_SIZE=5000 DATABASE_URL=postgresql://...prod... \
  bash packages/fengine/scripts/migrate-tenant.sh migrate inst_001

# 2. Monitor progress
while true; do
  psql -c "SELECT COUNT(*) FROM tenant_inst_001.accounts"
  sleep 10
done
```

### Phase 4: Switch Traffic (Application-level)

```bash
# 1. Update tenant routing (blue-green or canary)
kubectl patch deployment fengine \
  -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"tenant-schema\":\"inst_001\"}}}}}"

# 2. Monitor metrics
kubectl logs -f deployment/fengine | grep "ERROR\|latency"

# 3. Validate data consistency
psql -c "
  SELECT COUNT(*) as shared_accounts FROM public.accounts WHERE tenant_id = 'inst_001';
  SELECT COUNT(*) as tenant_accounts FROM tenant_inst_001.accounts;
"
```

### Phase 5: Cleanup (After Validation)

```bash
# Only after 24h+ stable operation:
# 1. Remove data from old shared table
psql -c "DELETE FROM public.accounts WHERE tenant_id = 'inst_001'"

# 2. Update metadata in configuration service
curl -X PATCH http://config-service/tenants/inst_001 \
  -H "Content-Type: application/json" \
  -d '{"schema_location":"tenant_inst_001"}'
```

## 2. Zero-Downtime Migration Patterns

### Adding Column with Non-Deterministic Default

**Problem**: Adding column with default `now()` requires table rewrite

**Solution** (3-step):

```sql
-- Step 1: Add nullable column (fast, no rewrite)
ALTER TABLE tenant_inst_001.accounts ADD COLUMN last_activity_at timestamptz;

-- Step 2: Backfill in batches (concurrent safe)
BEGIN;
UPDATE tenant_inst_001.accounts 
SET last_activity_at = now() 
WHERE last_activity_at IS NULL 
LIMIT 1000;
COMMIT;

-- Repeat LIMIT 1000 until all rows updated, or use worker job

-- Step 3: Add NOT NULL constraint
-- Option A: Fast with NOT VALID (PostgreSQL 12+)
ALTER TABLE tenant_inst_001.accounts 
ADD CONSTRAINT accounts_last_activity_not_null CHECK (last_activity_at IS NOT NULL) NOT VALID;

-- Option B: Validate constraint (concurrent safe)
ALTER TABLE tenant_inst_001.accounts 
VALIDATE CONSTRAINT accounts_last_activity_not_null;

-- Option C: Set NOT NULL (fast after NOT VALID validated)
ALTER TABLE tenant_inst_001.accounts ALTER COLUMN last_activity_at SET NOT NULL;
```

### Adding Index

**Safe for large tables** - Use CONCURRENTLY:

```sql
CREATE INDEX CONCURRENTLY idx_accounts_status 
ON tenant_inst_001.accounts(status) 
WHERE status IN ('ACTIVE', 'SUSPENDED');
```

### Adding Foreign Key

**No validation initially**:

```sql
-- Step 1: Add FK without validation (fast)
ALTER TABLE tenant_inst_001.transactions 
ADD CONSTRAINT fk_account_id FOREIGN KEY (account_id) 
REFERENCES tenant_inst_001.accounts(id) NOT VALID;

-- Step 2: Validate FK (concurrent safe)
ALTER TABLE tenant_inst_001.transactions 
VALIDATE CONSTRAINT fk_account_id;
```

## 3. Secrets Management

### Setup AWS Secrets Manager

```bash
# 1. Create secrets in AWS (manual or via script)
aws secretsmanager create-secret \
  --name getfluxo/fengine/database_url \
  --secret-string "postgresql://user:pass@host/db?schema=tenant_inst_001"

aws secretsmanager create-secret \
  --name getfluxo/fengine/jwt_secret \
  --secret-string "$(openssl rand -base64 32)"

# 2. Configure External Secrets Operator
bash packages/finfra/scripts/setup-secrets.sh

# 3. Verify secrets synced to Kubernetes
kubectl get secret -n getfluxo fengine-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

### Rotate Secrets

```bash
# 1. Update AWS secret (new version)
aws secretsmanager update-secret \
  --secret-id getfluxo/fengine/jwt_secret \
  --secret-string "$(openssl rand -base64 32)"

# 2. Force External Secrets to sync (auto within 1h, or manually)
kubectl delete secret -n getfluxo fengine-secrets
# External Secrets will recreate from new AWS version

# 3. Restart pods to pick up new secret
kubectl rollout restart deployment/fengine -n getfluxo
```

## 4. Tenant Provisioning

### New Tenant Onboarding

```bash
# 1. Create tenant schema
TENANT_ID=inst_newbank_001
DATABASE_URL=postgresql://... bash packages/fengine/scripts/migrate-tenant.sh create $TENANT_ID

# 2. Seed initial configuration (products, fees, workflows)
psql "$DATABASE_URL" << SQL
  INSERT INTO tenant_${TENANT_ID}.accounts (id, name, account_type, status) VALUES
    ('acct_demo_001', 'Demo Account', 'CHECKING', 'ACTIVE');
SQL

# 3. Enable RLS policies (if using shared tables)
bash packages/fengine/scripts/migrate-tenant.sh rls $TENANT_ID

# 4. Deploy tenant-specific resources
kubectl apply -f - <<EOF
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: tenant-${TENANT_ID}-config
    namespace: getfluxo
  data:
    tenant_id: $TENANT_ID
    schema_name: tenant_${TENANT_ID}
EOF

# 5. Update tenant registry
curl -X POST http://config-service/tenants \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\", \"schema_location\":\"tenant_${TENANT_ID}\", \"status\":\"ACTIVE\"}"
```

## 5. Monitoring & Troubleshooting

### Check Migration Progress

```bash
# 1. Row counts comparison
psql -c "
  SELECT 
    'shared' as location, COUNT(*) FROM public.accounts WHERE tenant_id = 'inst_001'
  UNION ALL
  SELECT 
    'tenant_schema', COUNT(*) FROM tenant_inst_001.accounts
"

# 2. Monitor active connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'getfluxo'"

# 3. Check long-running transactions
psql -c "SELECT pid, xmin, query FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5"
```

### Rollback Procedure

```bash
# If migration fails:
# 1. Stop application (or switch back to old schema)
kubectl scale deployment/fengine --replicas=0

# 2. Restore from backup snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier getfluxo-prod-restored \
  --db-snapshot-identifier getfluxo-pre-migration-xxxxx

# 3. Update connection string in secrets
aws secretsmanager update-secret \
  --secret-id getfluxo/fengine/database_url \
  --secret-string "postgresql://user:pass@old-host/db"

# 4. Restart application
kubectl scale deployment/fengine --replicas=2
```

## References

- PostgreSQL Docs: https://www.postgresql.org/docs/current/sql-altertable.html
- External Secrets: https://external-secrets.io/latest/
- AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/
- Zero-downtime Deploy Guide: https://wiki.postgresql.org/wiki/Zero_Downtime_Upgrades
