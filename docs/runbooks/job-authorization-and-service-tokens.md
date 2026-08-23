# Job authorization and service tokens

Operational contract for Workbench public jobs, Identity Access service
clients, Prometheus scrapes, and Ledger Core worker callbacks.

Verified against finance-platform pull request #52
(`workbench@0526dbe`, `identity-access@af357c7`, `ledger-core@0988a20`,
`operations@138dd5d`). Until that change merges, `main` still accepts
internal types on `POST /api/jobs` and leaves `GET /api/jobs/:jobId`
unscoped.

## Public payment jobs

`POST /api/jobs` requires `workbench.jobs.write`. Tenant is taken from the
access token. The public create body has no `tenant_id` field.

| Type | Extra permission |
| --- | --- |
| `PAYMENT_CAPTURE` | none |
| `PAYMENT_DISBURSEMENT` | none |
| `PAYMENT_RECONCILIATION` | none |
| `PAYMENT_SETTLEMENT` | `finance.approve` or `internal.worker` |

Any other type returns `403 Forbidden` (`Job type is not accepted on the
public jobs API`). Scheduler, outbox, and legacy controllers still enqueue
internal work; that is not a public client path.

`GET /api/jobs/:jobId` requires `workbench.read` and returns the job only
when `job.tenant_id` matches the token tenant. Unknown or cross-tenant IDs
return `404 Not Found`.

If `X-Tenant-ID` is sent and does not match the token `tenant_id`, Workbench
and Ledger Core return `403`.

Payment jobs do not use an `Idempotency-Key` header. Reuse
`payload.idempotency_key` on retry and persist the returned job `id`.
`COMPLETED` is not a ledger posting.

## Service client tokens

Clients that include `client_credentials` are forced to `private_key_jwt`.
`client_secret`, `client_secret_basic`, and `client_secret_post` fail for
that grant. Public operator clients continue to use Authorization Code with
PKCE (`none`).

Sign a PS256 assertion with the private key whose public JWK is registered
on the OAuth client:

| Header / claim | Value |
| --- | --- |
| `alg`, `kid` | `PS256` and the registered key id |
| `iss`, `sub` | service `client_id` |
| `aud` | token endpoint URL |
| `jti` | unique nonce |
| `exp` | short lifetime (Workbench uses 60 seconds) |

```http
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=PS256_JWT
&scope=internal.worker
```

Workbench issues this assertion from `WORKBENCH_PRIVATE_JWK_JSON` and
`WORKBENCH_OIDC_CLIENT_ID`. Store the private JWK in secrets, not in git.

Revoke tokens at Identity Access `POST /token/revocation`, not on Workbench.

## Prometheus scrape

`GET /api/metrics` is not a public integrator endpoint. It accepts either:

1. `Authorization: Bearer $WORKBENCH_METRICS_TOKEN` when that env var is
   set (scrape identity `metrics-scrape` with `observability.read`), or
2. A normal OIDC access token that includes `observability.read`.

Deployments must set `WORKBENCH_METRICS_TOKEN`. The operations ServiceMonitor
reads it from secret `workbench-secrets` / key `WORKBENCH_METRICS_TOKEN`.
`GET /api/health` stays public. `GET /api/status*` still requires
`workbench.read`.

## Ledger Core worker callbacks

`POST /internal/worker/events` and `POST /internal/worker/domain-events`
require `internal.worker`, a matching tenant, and a service subject
(`sub` starts with `client:`). Operator tokens are rejected with
`403 Forbidden` (`Domain event callbacks require a service identity`).

## Common pitfalls

- Sending a `client_secret` for `client_credentials` after #52 merges.
- Calling `PAYMENT_SETTLEMENT` with only `workbench.jobs.write`.
- Treating a `404` on job GET as "job was never created" when the token
  tenant does not own that id.
- Scraping `/api/metrics` without `WORKBENCH_METRICS_TOKEN` after deploy.
- Pointing Prometheus at `/api/status/metrics` (that route stays
  `workbench.read`, not the scrape token).
