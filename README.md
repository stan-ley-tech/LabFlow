# LabFlow

LabFlow is a laboratory workflow backend. It manages a lab order from the
moment a clinician requests a test until the result is validated and
delivered back to the requesting clinician.

The system is event-driven: state changes (order created, specimen
collected, result validated, critical result detected, ...) are published
as domain events and picked up by independent background workers. This
keeps the request path fast and lets slow or unreliable work — talking to
an external laboratory, sending notifications — happen asynchronously with
retries instead of blocking the API.

## Stack

- Node.js / Express — REST API
- PostgreSQL — system of record, plain SQL migrations, no ORM
- RabbitMQ — domain events, retry queues, dead-letter queues
- Redis — idempotency locks
- Docker Compose — local environment

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, sequence diagrams,
  and the reasoning behind the reliability choices (outbox, retries,
  idempotency, eventual consistency).
- [API.md](API.md) — REST endpoint reference.
- [EVENTS.md](EVENTS.md) — RabbitMQ event catalog, payload shapes, and the
  retry/dead-letter mechanics.
- [SECURITY.md](SECURITY.md) — authN/authZ, webhook signatures, secrets.
- [docs/sequence-diagrams/](docs/sequence-diagrams/) — the diagrams from
  ARCHITECTURE.md as standalone `.mmd` files.

## Getting started

Requirements: Docker, Docker Compose, Node.js 20+.

```bash
cp .env.example .env
docker compose up -d postgres redis rabbitmq
npm install
npm run migrate
npm run seed
```

Then run the three processes (each in its own terminal, or via
`docker compose up -d` once you've built the image with `make build`):

```bash
npm start            # API on :3000
npm run start:worker       # background workers on :3001 (health)
npm run start:externallab  # fake laboratory on :4000
```

`npm run seed` creates one account per role, all with the password
`DevPassword123!` (dev-only — see SECURITY.md):
`admin@labflow.local`, `clinician@labflow.local`, `collector@labflow.local`,
`labtech@labflow.local`, `validator@labflow.local`.

### Try it by hand

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@labflow.local","password":"DevPassword123!"}' | jq -r .token)

PATIENT=$(curl -s localhost:3000/patients -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
CLINICIAN=$(curl -s localhost:3000/clinicians -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
TEST=$(curl -s localhost:3000/lab-tests -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

ORDER=$(curl -s -X POST localhost:3000/lab-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"patientId\":\"$PATIENT\",\"clinicianId\":\"$CLINICIAN\",\"labTestIds\":[\"$TEST\"]}")
ORDER_ID=$(echo "$ORDER" | jq -r .id)

# a few seconds later, the order has been validated and a specimen requested:
curl -s localhost:3000/lab-orders/$ORDER_ID -H "Authorization: Bearer $TOKEN" | jq .

curl -s -X POST localhost:3000/lab-orders/$ORDER_ID/collect \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'

# a few seconds after that, the fake lab has acknowledged, "processed", and
# delivered a results webhook — check status again:
curl -s localhost:3000/lab-orders/$ORDER_ID -H "Authorization: Bearer $TOKEN" | jq .
```

See [API.md](API.md) for the full endpoint reference.

## Running the tests

```bash
docker compose up -d postgres redis rabbitmq
npm run migrate
npm test              # everything
npm run test:unit         # pure functions, no external services
npm run test:integration  # repositories, outbox, consumers, adapter — real Postgres/RabbitMQ
npm run test:api          # HTTP layer via supertest
npm run test:webhooks     # signature verification, duplicate delivery
npm run test:e2e          # full order lifecycle over real HTTP + RabbitMQ + a real fake-lab server
```

See [tests/](tests/) — organized by the same categories as above, plus
`tests/helpers/` for shared fixtures.

## Project layout

```
cmd/            entrypoints: server (API), worker, externallab
internal/
  adapters/       laboratory provider interface + implementations
  config/         env var loading
  db/             pg pool, transactions, migration runner, seed script
  domain/         one folder per aggregate: repository.js + service.js
  events/         RabbitMQ topology, connection, publisher, outbox, consumers
  externallab/    the fake laboratory's Express app + result generator
  http/           Express app, middleware, routes, request schemas
  lib/            small shared utilities (retry, circuit breaker, errors, ...)
  logger/         pino + correlation-id context
  redis/          redis client
  workers/        one handler per RabbitMQ consumer
migrations/     versioned SQL, up/down pairs
tests/          unit / integration / api / webhooks / e2e
docs/           sequence diagrams, architecture diagram
```

## Makefile targets

`make up` / `make down` (Docker Compose), `make migrate`, `make seed`,
`make test`, `make lint`. See [Makefile](Makefile).
