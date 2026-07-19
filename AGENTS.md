# AGENTS

## Cursor Cloud specific instructions

MAVULA is a headless finance platform. The runnable code lives in git **submodules**
under `packages/` (init with `pnpm submodules:init`). There is no UI for the core
product; verify things with API calls + Postgres. Standard build/test/run commands
are in the root `README.md` and each package's `package.json` — prefer those.

### Services and how to run them
Backing services: **PostgreSQL** and **Redis** are pre-installed in the VM image but
are NOT started automatically. Start them each session:

```bash
sudo pg_ctlcluster 16 main start      # Postgres on :5432
sudo redis-server /etc/redis/redis.conf --daemonize yes   # Redis on :6379
```

App services (each reads `process.env`; nothing auto-loads `.env`, so source it and
map the root var to the in-process `DATABASE_URL` per service):

| Service | Port | Health | Run command (from repo root, after `set -a; source .env; set +a`) |
| --- | --- | --- | --- |
| identity-access (OIDC issuer) | 3020 | `GET /health` | `DATABASE_URL="$IDENTITY_DATABASE_URL" PORT=3020 pnpm --filter @mavula/identity-access start` |
| ledger-core (financial core) | 3000 | `GET /api/health` | `DATABASE_URL="$LEDGER_CORE_DATABASE_URL" OIDC_AUDIENCE=urn:mavula:ledger-core PORT=3000 pnpm --filter @mavula/ledger-core start:dev` |
| workbench (workers/status) | 3010 | `GET /api/health` | `DATABASE_URL="$WORKBENCH_DATABASE_URL" OIDC_AUDIENCE=urn:mavula:workbench LEDGER_CORE_URL=http://localhost:3000 PORT=3010 pnpm --filter @mavula/workbench start:dev` |

`settlements` and `legacy-connectors` are libraries (no HTTP server); they run inside
workbench. `developer-docs` is an optional Astro docs site (`pnpm --filter
@mavula/developer-docs dev`), not part of the core product.

### `.env` (git-ignored) — generated secrets
None of the placeholders in `.env.example` are usable as-is. A working `.env` with
generated RSA PS256 JWKS, cookie keys, DB role passwords, and a bootstrap OAuth client
was created during setup. If `.env` is missing, it must be regenerated (the identity
signing keys, `LEDGER_CORE_DATABASE_ROLE_PASSWORD`, and
`LEGACY_CONNECTORS_DATABASE_ROLE_PASSWORD` must match the passwords provisioned on the
Postgres roles). All values must be single-quoted so `set -a; source .env; set +a`
survives spaces/JSON.

### One-time DB setup (already done; re-run only on a fresh database)
Single `mavula` database, per-service Postgres schemas (`identity`, `public`,
`settlements`, `legacy_connectors`). Superuser role `mavula/mavula_dev`. Migrations
create the non-bypass RLS roles `ledger_core_app` and `legacy_connectors_app`; the
`database:provision-role` scripts set their login passwords.

```bash
set -a; source .env; set +a
DATABASE_URL="$WORKBENCH_DATABASE_URL"                     pnpm --filter @mavula/settlements prisma:migrate
DATABASE_URL="$LEGACY_CONNECTORS_MIGRATION_DATABASE_URL"   pnpm --filter @mavula/legacy-connectors prisma:migrate
pnpm --filter @mavula/legacy-connectors database:provision-role
DATABASE_URL="$IDENTITY_DATABASE_URL"                      pnpm --filter @mavula/identity-access prisma:migrate
pnpm --filter @mavula/ledger-core database:migrate
pnpm --filter @mavula/ledger-core database:provision-role
DATABASE_URL="$IDENTITY_DATABASE_URL"                      pnpm --filter @mavula/identity-access bootstrap
```

### Known gotchas discovered during setup (important)
- **identity-access `start:dev` is broken here.** Its dev command is `tsx watch`, and
  `tsx`/esbuild does not emit `emitDecoratorMetadata`, so NestJS constructor injection
  yields `undefined` deps (`Cannot read properties of undefined (reading 'oAuthClient')`).
  Run the compiled build instead: `pnpm --filter @mavula/identity-access build` then
  `pnpm --filter @mavula/identity-access start` (`node dist/main.js`, which is also the
  Dockerfile `CMD`). ledger-core/workbench use `ts-node-dev` and DO emit metadata, so
  their `start:dev` works.
- **identity-access OIDC HTTP endpoints don't mount.** `main.ts` mounts
  `provider.callback()` on Express *after* `app.init()`, so Nest's 404 layer shadows
  `/token`, `/jwks`, and `/.well-known/openid-configuration` (they return Nest 404s).
  To get real OIDC discovery/JWKS/tokens, host the provider via the same code path the
  repo's own test uses, on a side port, backed by the identity DB:

  ```js
  // node <file>.mjs  with  DATABASE_URL="$IDENTITY_DATABASE_URL" and identity env vars set
  import { createServer } from 'node:http';
  import { PrismaService } from './packages/identity-access/dist/prisma.service.js';
  import { IdentityService } from './packages/identity-access/dist/identity.service.js';
  import { createOidcProvider } from './packages/identity-access/dist/oidc.provider.js';
  const prisma = new PrismaService(); await prisma.$connect();
  const provider = await createOidcProvider(prisma, new IdentityService(prisma));
  const cb = provider.callback();
  createServer((req, res) => cb(req, res)).listen(3021, '127.0.0.1');
  // discovery/jwks/token served at :3021; tokens carry iss=IDENTITY_ISSUER (:3020)
  ```

  Point ledger-core/workbench `OIDC_JWKS_URI` at `http://localhost:3021/jwks` (keep
  `OIDC_ISSUER=http://localhost:3020`). Note the DB-registered client also lacks
  `id_token_signed_response_alg` in `providerClient()`, so the `client_credentials`
  token grant is rejected (`id_token_signed_response_alg must be 'PS256'`) — for local
  ledger-core testing, mint a PS256 `at+jwt` with the identity signing key and the
  claims `sub, tenant_id, institution_id, roles, permissions` (verified against the
  side-host JWKS).

### Lint / test / build
- Lint: `pnpm lint` (only `settlements` defines a lint script — a typecheck).
- Tests: `pnpm contracts:check`, and per package `pnpm --filter @mavula/<pkg> test`
  (ledger-core: `test:all`, workbench: `test:all`). DB-backed suites need Postgres +
  Redis up and `.env` sourced.
- Build: `pnpm -r build` (runs `prisma generate` via each package's `prebuild`).
