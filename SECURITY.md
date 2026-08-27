# Security

## Authentication

`POST /auth/login` issues a JWT (`jsonwebtoken`, HS256) signed with
`JWT_SECRET`, carrying the user's id (`sub`), email, and role, expiring
after `JWT_EXPIRES_IN` (default 8h). Every route other than `/health`,
`/ready`, `/auth/login`, and the results webhook requires
`Authorization: Bearer <token>` — see [internal/http/middleware/auth.js](internal/http/middleware/auth.js).

Passwords are hashed with `bcryptjs` (12 rounds) and never returned by any
endpoint (`internal/domain/users/service.js#toPublicUser` explicitly
excludes the hash from every response).

**Change `JWT_SECRET` and every account's password before this leaves a
development environment.** The values in `.env.example` and the seed
script (`internal/db/seed.js`) are dev-only and are not a secret in any
meaningful sense — they're printed in this repository.

## Authorization (RBAC)

Six roles: `admin`, `clinician`, `specimen_collector`, `lab_technician`,
`lab_validator`, `system`. `internal/http/middleware/rbac.js#requireRole`
gates each mutating route to the roles that should be able to call it —
see [API.md](API.md) for the exact mapping. `admin` can do anything a more
specific role can; there is no role hierarchy beyond that (a `clinician`
cannot validate results, a `lab_validator` cannot create orders).

Read endpoints (`GET`) require authentication but not a specific role —
any authenticated user can look up a patient, order, or result. Real
deployments handling PHI would likely want row-level restrictions here
(a clinician seeing only their own patients, for instance); that's out of
scope for this project and called out as a known gap.

## Webhook security

`POST /webhooks/laboratory/results` doesn't carry a bearer token — it's
called by the laboratory, not by an authenticated LabFlow user — so it's
secured differently:

- **HMAC-SHA256 signature.** Every laboratory has its own `webhook_secret`
  (`laboratories.webhook_secret`). The sender signs the raw request body
  and sends `X-Labflow-Signature: sha256=<hex>`; the route recomputes the
  signature from the raw bytes (not the parsed-and-reserialized JSON —
  those aren't guaranteed to match byte-for-byte) and compares with
  `crypto.timingSafeEqual`, so a wrong guess can't be narrowed down one
  byte at a time via response-timing. See [internal/lib/webhookSignature.js](internal/lib/webhookSignature.js).
- **The laboratory is identified by `laboratoryCode` in the payload**,
  looked up before the signature is checked (so the right secret is used).
  An unregistered code is rejected before signature verification even
  runs.
- **Delivery-level idempotency** stops a redelivered webhook (same
  `webhookId`) from being processed twice — see ARCHITECTURE.md and
  EVENTS.md for the mechanics.

Rotating a laboratory's secret is a plain `UPDATE laboratories SET
webhook_secret = ...` (no endpoint for it yet); the laboratory would need
to switch to signing with the new secret at the same time, which for a
real provider means coordinating a cutover window.

## Idempotency

`POST /lab-orders` accepts an `Idempotency-Key` header. The key plus the
route plus a hash of the request body is stored in `idempotency_keys`; a
retried request with the same key and body replays the original response
instead of creating a second order, and a retried request with the same
key but a *different* body is rejected as a conflict rather than silently
picked. See ARCHITECTURE.md for the full design (including the Redis lock
that arbitrates concurrent retries) and [internal/http/middleware/idempotency.js](internal/http/middleware/idempotency.js).

## Transport and headers

- `helmet()` sets the standard security headers (`X-Content-Type-Options`,
  a conservative `Content-Security-Policy`, etc.) on every response.
- `cors()` currently allows all origins — fine for local development and
  for a backend meant to be called from a trusted internal frontend, not
  something to carry into a public deployment unchanged.
- TLS termination is assumed to happen in front of this service (a load
  balancer or ingress); the app itself speaks plain HTTP, matching how
  it's deployed here (Docker Compose, no TLS).

## Correlation IDs and audit logging

Every request gets a correlation ID (`X-Correlation-Id`, reused if the
caller sent one, otherwise generated) that's threaded through logs and
into any event published as a result of that request, and a fresh
per-request request ID. Neither is a secret, but together they make it
possible to reconstruct exactly what happened for a given order without
grepping logs by timestamp — see [internal/logger/context.js](internal/logger/context.js).

Every mutation records a row in `audit_logs` (actor, action, entity,
metadata, correlation ID) inside the same database transaction as the
change itself, so the audit trail can't be out of sync with what actually
happened — either both commit or neither does.

## Secrets and configuration

All secrets (`JWT_SECRET`, `EXTERNAL_LAB_WEBHOOK_SECRET`, database and
broker credentials) are read from environment variables (`internal/config`),
never hardcoded, and `.env` is git-ignored. `.env.example` documents every
variable with obviously-fake placeholder values.

## Known limitations

This is a portfolio/reference project, not a production PHI system. Things
a real deployment would need that are deliberately out of scope here:

- No row-level access control (a `clinician` can read every patient, not
  just their own).
- No rate limiting on `/auth/login` (a real deployment should throttle
  login attempts).
- No secret rotation tooling beyond a manual `UPDATE`.
- No encryption at rest configuration for Postgres (left to the deployment
  environment).
- CORS is wide open, as noted above.
