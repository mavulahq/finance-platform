# GetFlux.io - CI/CD Pipeline Architecture

**Author**: Estandar Mustaq <estandarmustaq@getflux.io>  
**Copyright**: (c) 2025 GetFlux.io - All Rights Reserved  
**Document Version**: 1.0.0

---

## 1. Pipeline Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        GitHub Event Triggers                        │
├────────────────────────────────────────────────────────────────────┤
│  • Push to main/develop → Automatic build & test                   │
│  • PR merge to main → Build + deploy to staging                   │
│  • Tag release/* → Build + deploy to production                    │
│  • Manual workflow_dispatch → Deploy to environment               │
└────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflows                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1️⃣  CI_BUILD_TEST.yml                                            │
│      • Trigger: push, pull_request                                 │
│      • Checkout submodules (recursive)                             │
│      • Install dependencies (pnpm)                                 │
│      • Run lint, typecheck, test                                   │
│      • Build packages (fengine, fpay, fagent, fwk)                │
│      • Coverage reports                                             │
│      • Slack notification (failure)                                │
│      Status: ✅ All tests pass → proceed                          │
│                                                                    │
│  2️⃣  SECURITY_SCAN.yml                                            │
│      • Trigger: push to main                                       │
│      • SAST: SonarQube scan                                        │
│      • Dependency check: npm audit                                 │
│      • Container scan: Trivy                                       │
│      • Secrets scan: git-secrets                                   │
│      • DAST: Run on staging                                        │
│      Status: ✅ No critical issues → proceed                      │
│                                                                    │
│  3️⃣  BUILD_CONTAINERS.yml                                         │
│      • Trigger: CI_BUILD_TEST success + tag release               │
│      • Build images (with submodule commits)                      │
│      • Tag: getflux/fengine:1.2.3                                 │
│      • Push to ECR (AWS)                                           │
│      • Sign images (Cosign)                                        │
│      • Generate SBOM                                               │
│      Status: ✅ Images in registry → proceed                      │
│                                                                    │
│  4️⃣  DEPLOY_STAGING.yml                                           │
│      • Trigger: PR merge to main                                   │
│      • Pull images from ECR                                        │
│      • Apply K8s manifests (staging namespace)                     │
│      • Run smoke tests                                             │
│      • Slack notification (deployed)                               │
│      Status: ✅ Staging live → ready for testing                  │
│                                                                    │
│  5️⃣  DEPLOY_PRODUCTION.yml                                        │
│      • Trigger: Manual or tag release/v*                          │
│      • Approval gate (Slack, email)                                │
│      • Blue-green deployment                                       │
│      • Canary rollout (10% → 50% → 100%)                         │
│      • Monitoring checks                                           │
│      • Auto-rollback on errors                                     │
│      Status: ✅ Production live + monitored                       │
│                                                                    │
│  6️⃣  INFRASTRUCTURE.yml                                           │
│      • Trigger: Manual                                             │
│      • Terraform plan (development)                                │
│      • Review & approval                                           │
│      • Terraform apply                                             │
│      • Update DNS, LB configs                                      │
│      Status: ✅ Infrastructure updated                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. GitHub Actions Workflow Files

### 2.1 CI_BUILD_TEST.yml

Located: `.github/workflows/ci-build-test.yml`

```yaml
name: CI - Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      node-version: ${{ steps.versions.outputs.node }}
      pnpm-version: ${{ steps.versions.outputs.pnpm }}
    steps:
      - name: Determine versions
        id: versions
        run: |
          echo "node=20.10.0" >> $GITHUB_OUTPUT
          echo "pnpm=8.15.0" >> $GITHUB_OUTPUT

  build-and-test:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: [fengine, fwallet, fpay, fwk, fxAI, fagent]
    
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      
      - uses: pnpm/action-setup@v2
        with:
          version: ${{ needs.setup.outputs.pnpm-version }}
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ needs.setup.outputs.node-version }}
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Lint
        run: pnpm --filter @getflux/${{ matrix.package }} lint
      
      - name: Type check
        run: pnpm --filter @getflux/${{ matrix.package }} typecheck
      
      - name: Unit tests
        run: pnpm --filter @getflux/${{ matrix.package }} test:unit
      
      - name: Integration tests
        run: pnpm --filter @getflux/${{ matrix.package }} test:integration
      
      - name: Coverage report
        run: pnpm --filter @getflux/${{ matrix.package }} test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./packages/${{ matrix.package }}/coverage/coverage-final.json

  security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      
      - name: SonarQube scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
      
      - name: npm audit
        run: npm audit --production --audit-level=moderate
      
      - name: Git secrets scan
        run: |
          git clone https://github.com/gitleaks/gitleaks-action.git
          bash gitleaks-action/gitleaks-action

  notify:
    if: failure()
    needs: [build-and-test, security-checks]
    runs-on: ubuntu-latest
    steps:
      - name: Slack notification
        uses: slackapi/slack-github-action@v1.24.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "❌ CI Pipeline Failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Build failed* in ${{ github.repository }}\nCommit: <${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }}|${{ github.sha }}>\nAuthor: ${{ github.actor }}"
                  }
                }
              ]
            }
```

### 2.2 BUILD_CONTAINERS.yml

Located: `.github/workflows/build-containers.yml`

```yaml
name: Build Containers

on:
  workflow_run:
    workflows: ["CI - Build & Test"]
    types: [completed]
    branches: [main]
  push:
    tags:
      - 'release/v*'

jobs:
  build-images:
    if: github.event.workflow_run.conclusion == 'success' || startsWith(github.ref, 'refs/tags/release/')
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        service: [fengine, fpay, fagent, fwk]
    
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Log in to ECR
        uses: aws-actions/amazon-ecr-login@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      
      - name: Generate image tag
        id: tags
        run: |
          if [[ "${{ github.event_name }}" == "push" && "${{ github.ref }}" == refs/tags/release/* ]]; then
            VERSION=${GITHUB_REF#refs/tags/release/}
          else
            VERSION=sha-${GITHUB_SHA::7}
          fi
          REGISTRY=${{ secrets.AWS_REGISTRY }}
          echo "tag=${REGISTRY}/getflux/${{ matrix.service }}:${VERSION}" >> $GITHUB_OUTPUT
          echo "latest=${REGISTRY}/getflux/${{ matrix.service }}:latest" >> $GITHUB_OUTPUT
      
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: ./packages/${{ matrix.service }}
          push: true
          tags: |
            ${{ steps.tags.outputs.tag }}
            ${{ steps.tags.outputs.latest }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.tags.outputs.tag }}
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
      
      - name: Sign image
        run: |
          cosign sign --key ${{ secrets.COSIGN_KEY }} ${{ steps.tags.outputs.tag }}
```

### 2.3 DEPLOY_PRODUCTION.yml

Located: `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options:
          - staging
          - canary
          - production
      version:
        description: 'Version to deploy (tag name)'
        required: true

jobs:
  approval:
    runs-on: ubuntu-latest
    environment:
      name: production-approval
    steps:
      - name: Manual approval required
        run: echo "Deployment requires manual approval"

  deploy:
    needs: approval
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.inputs.environment }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > $HOME/.kube/config
          kubectl version
      
      - name: Update Kubernetes manifests
        run: |
          kubectl set image deployment/fengine-api \
            fengine=${{ secrets.AWS_REGISTRY }}/getflux/fengine:${{ github.event.inputs.version }} \
            -n getflux-${{ github.event.inputs.environment }}
      
      - name: Monitor rollout
        run: |
          kubectl rollout status deployment/fengine-api \
            -n getflux-${{ github.event.inputs.environment }} \
            --timeout=10m
      
      - name: Health checks
        run: |
          bash packages/finfra/scripts/health-check.sh ${{ github.event.inputs.environment }}
      
      - name: Slack notification
        if: success()
        uses: slackapi/slack-github-action@v1.24.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "✅ Deployment Successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployed*\nVersion: ${{ github.event.inputs.version }}\nEnvironment: ${{ github.event.inputs.environment }}"
                  }
                }
              ]
            }
      
      - name: Auto-rollback on failure
        if: failure()
        run: |
          echo "Rolling back to previous version..."
          kubectl rollout undo deployment/fengine-api -n getflux-${{ github.event.inputs.environment }}
```

---

## 3. Deployment Environments

### 3.1 Staging Environment

**Purpose**: Pre-production testing, feature validation  
**Infrastructure**: 3-node EKS cluster (t3.medium)  
**Database**: PostgreSQL RDS (db.t3.small)  
**Retention**: 30 days logs, 7 days backups  
**Cost**: ~$300/month

**Deployment**:
```bash
# Auto-deployed on PR merge to main
git merge origin/main
# Triggers: Build → Push ECR → Deploy K8s → Smoke tests
```

### 3.2 Production Environment

**Purpose**: Live customer data, production workloads  
**Infrastructure**: 5-node EKS cluster (t3.large + spot instances)  
**Database**: PostgreSQL RDS (db.r5.large, Multi-AZ)  
**Retention**: 90 days logs, 30 days backups + PITR  
**Cost**: ~$2,500/month

**Deployment**:
```bash
# Manual trigger with approval
git tag release/v1.2.3
git push --tags
# Triggers: Security scan → Build → Manual approval → Blue-green deploy → Canary rollout
```

---

## 4. Monitoring & Observability

### 4.1 Stack

```
Application Logs (JSON)
         ↓
    [Promtail] ←── Kubernetes
         ↓
    [Loki]  ←── Log aggregation
         ↓
    [Grafana] ←── Visualization + Dashboards
         ↓
    [PagerDuty] ←── Alerting

Application Metrics
         ↓
    [Prometheus Exporter] ←── Node, Container, App metrics
         ↓
    [Prometheus] ←── Metrics scraping (15s interval)
         ↓
    [Grafana] ←── Dashboards
         ↓
    [PagerDuty] ←── Alerts (SLA violations)

Application Traces
         ↓
    [OpenTelemetry] ←── Instrumentation
         ↓
    [Jaeger] ←── Trace backend
         ↓
    [Grafana] ←── Visualization
```

### 4.2 Key Metrics & Alerts

| Metric | Threshold | Severity |
|--------|-----------|----------|
| API Response Time (p99) | > 500ms | Warning |
| API Response Time (p99) | > 1s | Critical |
| Error Rate | > 1% | Warning |
| Error Rate | > 5% | Critical |
| Pod CPU | > 80% | Warning |
| Pod Memory | > 90% | Critical |
| Database Connections | > 80 of 100 | Warning |
| Database Replication Lag | > 5s | Critical |
| Disk Usage | > 85% | Warning |

---

## 5. Rollback Strategy

### 5.1 Automatic Rollback

**Triggers**:
- Pod CrashLoopBackOff detected
- Health check failures (3 consecutive)
- Error rate > 10% for 5 minutes
- Response time p99 > 2 seconds for 5 minutes

**Action**:
```bash
kubectl rollout undo deployment/fengine-api -n getflux-prod
```

### 5.2 Manual Rollback

```bash
# View rollout history
kubectl rollout history deployment/fengine-api -n getflux-prod

# Rollback to previous revision
kubectl rollout undo deployment/fengine-api -n getflux-prod --to-revision=5

# Verify
kubectl rollout status deployment/fengine-api -n getflux-prod
```

---

## 6. Compliance & Auditing

### 6.1 Deployment Audit Trail

All deployments logged:
- Who: GitHub actor
- What: Commit SHA, image tag, version
- When: Timestamp
- Where: Environment, region
- Why: Commit message, approval reason
- Approval: Manual or automated

**Audit Log Location**: `s3://getflux-audit-logs/deployments/`

### 6.2 Security Scanning Results

- **SAST**: SonarQube (code quality, vulnerabilities)
- **Dependency Check**: npm audit (package vulnerabilities)
- **Container Scan**: Trivy (image vulnerabilities)
- **Secrets**: git-secrets (hardcoded credentials)

All scan results retained for 1 year (regulatory compliance).

---

## 7. Version Control & Tagging

### 7.1 Git Workflow

```
main branch
├── Protected (requires PR + review)
├── Always deployable
├── Tags: release/v1.2.3
│
develop branch
├── Working branch
├── Merge PRs from feature branches
└── Nightly builds

feature branches
├── Created from: develop
├── Naming: feat/tenant-config, fix/auth-bug
├── Reviewed before merge to develop
└── Auto-deleted after merge
```

### 7.2 Semantic Versioning

**Format**: `major.minor.patch-prerelease+build`

- **Major**: Breaking changes (schema migrations, API incompatible)
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes
- **Prerelease**: alpha, beta, rc (e.g., 1.2.0-beta.1)
- **Build**: Metadata (e.g., +build.20250120)

**Examples**:
- `release/v1.0.0` - First production release
- `release/v1.1.0` - New features, backward compatible
- `release/v1.1.1` - Bug fix
- `release/v2.0.0` - Major breaking change

---

**Last Updated**: 2025-01-20  
**Next Review**: 2025-02-20
