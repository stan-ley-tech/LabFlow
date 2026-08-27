# API

Base URL: `http://localhost:3000` (default `PORT`). All endpoints except
`/health`, `/ready`, `/auth/login`, and `/webhooks/laboratory/results`
require `Authorization: Bearer <token>` from `POST /auth/login`.

Every response body from a route handler is JSON. Errors follow one shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "patient not found" } }
```

Validation errors additionally include `details` (the zod issue list).

## Roles

`admin`, `clinician`, `specimen_collector`, `lab_technician`, `lab_validator`,
`system`. Each write endpoint below lists which roles may call it; `admin`
can always do everything a more specific role can.

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | Liveness — always `200 { status: "ok" }` once the process is up. |
| GET | `/ready` | none | Readiness — checks Postgres and Redis (and, on the worker's own health server on `PORT+1`, RabbitMQ too). `503` if anything is down. |

## Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` → `{ token, user }`. |
| POST | `/auth/users` | `admin` | Provisions an account for any role. |

## Patients

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/patients` | `admin`, `clinician`, `specimen_collector` | `{ mrn, firstName, lastName, dateOfBirth, sex?, phone?, email?, address? }`. `409` on a duplicate MRN. |
| GET | `/patients` | any | `?limit=25&offset=0`. |
| GET | `/patients/:id` | any | |
| GET | `/patients/:id/lab-results` | any | All results across all of the patient's orders, most recent first. |

## Clinicians

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/clinicians` | `admin` | `{ licenseNumber, firstName, lastName, email, phone?, department? }`. |
| GET | `/clinicians` | any | `?limit=25&offset=0`. |
| GET | `/clinicians/:id` | any | |

## Lab test catalog

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/lab-tests` | `admin`, `lab_technician` | `{ code, name, specimenType, turnaroundHours? }`. |
| GET | `/lab-tests` | any | `?limit=50&offset=0` — active tests only unless `?all=true`. |
| GET | `/lab-tests/:id` | any | |

## Laboratories

Registered laboratory providers (the fake external lab, or a future real
one). See ARCHITECTURE.md for the adapter pattern this backs.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/laboratories` | `admin` | `{ code, name, adapterType, baseUrl, webhookSecret }`. |
| GET | `/laboratories` | any | Active only unless `?all=true`. |
| GET | `/laboratories/:id` | any | |

## Lab orders

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/lab-orders` | `admin`, `clinician` | `{ patientId, clinicianId, labTestIds: [uuid,...], priority?, notes? }`. Supports `Idempotency-Key` (see SECURITY.md). `404` if the patient/clinician don't exist; `422` if a test id doesn't. |
| GET | `/lab-orders` | any | `?patientId=&status=&limit=25&offset=0`. |
| GET | `/lab-orders/:id` | any | Includes `items[]` and the current `specimen` (if any). |
| POST | `/lab-orders/:id/collect` | `admin`, `specimen_collector` | `{ notes? }`. `404` if no specimen has been requested yet; `409` if it's already past `requested`. |

## Specimens

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/specimens/:id` | any | Includes the full `events[]` chain-of-custody trail. |

## Lab results

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/lab-results` | `admin`, `lab_technician` | Normally only ever called by the webhook handler internally, exposed here too for manual/test use. `{ labOrderItemId, laboratoryId, values: [...] }`. |
| GET | `/lab-results/:id` | any | Includes `values[]`. |
| POST | `/lab-results/:id/validate` | `admin`, `lab_validator` | `409` if not currently `pending_validation`. Publishes `lab.result.validated` (and `lab.result.critical` if any value is critical). |

## Webhooks

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/webhooks/laboratory/results` | HMAC signature (`X-Labflow-Signature`), no bearer token | Inbound results delivery from a laboratory adapter. See SECURITY.md for the signature scheme and EVENTS.md for what it does once verified. |

## Example: create and collect an order

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"clinician@labflow.local","password":"DevPassword123!"}' | jq -r .token)

curl -s -X POST localhost:3000/lab-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-2026-08-27-001' \
  -d '{"patientId":"<uuid>","clinicianId":"<uuid>","labTestIds":["<uuid>"]}'

curl -s -X POST localhost:3000/lab-orders/<id>/collect \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```
