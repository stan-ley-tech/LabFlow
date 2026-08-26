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

## Status

Actively under construction. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
system design and [API.md](API.md) / [EVENTS.md](EVENTS.md) for the
contracts as they land.

## Stack

- Node.js / Express — REST API
- PostgreSQL — system of record, plain SQL migrations, no ORM
- RabbitMQ — domain events, retry queues, dead-letter queues
- Redis — idempotency locks, circuit breaker state
- Docker Compose — local environment

## Getting started

Requirements: Docker, Docker Compose, Node.js 20+.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migrate
npm start
```

More detail on running the full stack (API, worker, fake external lab) is
in the [Makefile](Makefile) targets and `docker-compose.yml`.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, data flow, and the
  reasoning behind the reliability choices (outbox, retries, idempotency).
- [API.md](API.md) — REST endpoint reference.
- [EVENTS.md](EVENTS.md) — RabbitMQ event catalog and payload shapes.
- [SECURITY.md](SECURITY.md) — authN/authZ, secrets, and webhook security.
