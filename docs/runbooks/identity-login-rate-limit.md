# Identity interactive login rate limit

Operational contract for the in-memory limiter on the Identity Access
operator sign-in form.

Verified against finance-platform pull request #50
(`identity-access@308f065`). Until that change merges, `main` still keys
one window as `${ip}:${email}`, does not cap a source that rotates
account identifiers, and never sweeps expired windows.

This path is not a public integrator API. Public OpenAPI excludes OIDC
interaction. Token and client-credentials grants are not counted here.

## Where it applies

`POST /interaction/:uid` when the OIDC prompt is `login`.

CSRF is checked first. Invalid CSRF returns `401` and does not increment
the limiter. Consent submission is not limited. `GET /interaction/:uid`
is not limited.

Failed `authenticate()` calls increment the limiter. That includes
invalid credentials, no active membership, and a missing `institution_id`
when more than one membership exists. A successful password login clears
only the account window.

## Windows and defaults

Each Identity Access process keeps two sliding windows in memory:

| Window | Key | Default limit | Env |
| --- | --- | --- | --- |
| Source | `source:${remoteAddress}` | 50 failures | `IDENTITY_LOGIN_SOURCE_ATTEMPT_LIMIT` |
| Account | `account:${email}` | 5 failures | `IDENTITY_LOGIN_ATTEMPT_LIMIT` |

Both use `IDENTITY_LOGIN_ATTEMPT_WINDOW_MS` (default `300000`, five
minutes). Expired entries are removed on the next check, at most once
per `min(windowMs, 60000)` milliseconds.

`email` is trimmed and lowercased. `remoteAddress` is
`req.ip || req.socket?.remoteAddress || 'unknown'`. Identity Access does
not enable a trusted-proxy setting, so the source key is the immediate
TCP peer.

Either window at its limit throws:

```json
{
  "statusCode": 429,
  "message": "Too many authentication attempts",
  "error": "Too Many Requests"
}
```

There is no `Retry-After` header. Wait for the window to expire, or
restart the process (state is not durable).

Compose and the Kubernetes `identity-access-secrets` manifest do not set
these variables today. Unset values use the defaults above. Changing a
value requires a process restart.

## Why the source window exists

A rotating-identifier attack that guesses a new email on every POST
would otherwise allocate one account window per guess for the process
lifetime. The source window blocks that source after its own limit,
before more account windows are created. A 10,000-failure rotation
against the defaults retains one source window plus 50 account windows
instead of 10,000.

## Common pitfalls

- Shared egress or an ingress hop that is the TCP peer: many operators
  share one source window of 50 failures per five minutes.
- Scaling Identity Access replicas: each replica has its own map, so
  the effective budget is per process, not cluster-wide.
- A successful login does not clear the source window. Other accounts
  on the same peer still count toward the source limit.
- `429` on `/token` is not this limiter. Do not treat public-API
  `Retry-After` guidance as applying to the sign-in form.
- Deploy or restart clears lockouts. Do not rely on that as a
  production unlock procedure.
