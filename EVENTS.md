# Events

LabFlow is event-driven end to end: every state transition in the order
lifecycle is published as a domain event on a RabbitMQ topic exchange
(`labflow.events`) and picked up by an independent consumer. This document
is the catalog of those events, who publishes and consumes each one, and
how delivery, retries, and dead-lettering work.

See [internal/events/topology.js](internal/events/topology.js) for the
source of truth — this file describes it in prose.

## Delivery mechanics

- **Exchange**: `labflow.events`, a durable topic exchange. Routing key ==
  event type.
- **Publishing**: nothing publishes directly to RabbitMQ from inside an
  HTTP request. Domain writes and the event they trigger are committed
  together to Postgres via the [transactional outbox](internal/events/outbox.js)
  (`outbox_events` table); a relay loop in the worker process
  ([internal/events/outboxRelay.js](internal/events/outboxRelay.js)) polls
  that table and does the actual publish, with RabbitMQ publisher confirms.
  See ARCHITECTURE.md for why.
- **Consuming**: one durable queue per consumer, bound to exactly one
  routing key. A handler that throws does not crash the worker or drop the
  message — see "Retries and dead-lettering" below.
- **Envelope**: every message body is JSON shaped like:

  ```json
  {
    "eventId": "uuid",
    "eventType": "lab.order.created",
    "aggregateType": "lab_order",
    "aggregateId": "uuid",
    "occurredAt": "2026-08-27T05:42:46.635Z",
    "correlationId": "uuid or null",
    "data": { "...": "event-specific payload" }
  }
  ```

  `correlationId` is carried from the originating HTTP request (or the
  event that triggered this one) so a single order's entire journey through
  logs is traceable — see SECURITY.md and ARCHITECTURE.md for more on
  correlation IDs.

## Retries and dead-lettering

Each consumer has three queues: a main queue, a retry queue, and a
dead-letter queue (DLQ). On failure:

1. The consumer computes the current retry count from the message's
   `x-retry-count` header (default 0) and compares it against that
   consumer's `maxRetries`.
2. **Under the limit**: republish to the retry exchange with `x-retry-count`
   incremented and a per-message `expiration` (TTL) set to an exponential
   backoff value (1s, 2s, 4s, 8s, ... capped at 60s, ±10% jitter). The retry
   queue has no consumer — messages just sit until their TTL expires, then
   RabbitMQ dead-letters them back to the main exchange under their
   original routing key, landing back on the main queue for redelivery.
   The original message is acked either way, so it isn't sitting unacked in
   the main queue during the wait.
3. **At the limit**: the message is written to the `dead_letters` table
   (queue name, routing key, payload, headers, error) and published to that
   consumer's DLQ, where it stays for manual inspection — nothing consumes
   from a DLQ automatically.

This means a brief outage (the fake laboratory being slow, a transient DB
blip) self-heals via the retry queue; a sustained outage exhausts retries
and the affected messages are visible in `dead_letters` rather than lost or
retried forever.

## Event catalog

| Event | Published by | Consumed by | Payload (`data`) |
|---|---|---|---|
| `lab.order.created` | `POST /lab-orders` (via outbox) | `order-validation` → [orderValidationWorker](internal/workers/orderValidationWorker.js) | `{ labOrderId, orderNumber, patientId, clinicianId, priority, labTestIds }` |
| `lab.order.validated` | `orderValidationWorker` | `specimen-request` → [specimenRequestWorker](internal/workers/specimenRequestWorker.js) | `{ labOrderId, patientId, clinicianId }` |
| `specimen.requested` | `specimenRequestWorker` | *(none — informational / audit trail)* | `{ specimenId, labOrderId, specimenType, barcode }` |
| `specimen.collected` | `POST /lab-orders/:id/collect` (via outbox) | `specimen-dispatch` → [specimenDispatchWorker](internal/workers/specimenDispatchWorker.js) | `{ specimenId, labOrderId, barcode }` |
| `specimen.received` | `specimenDispatchWorker`, after the laboratory adapter acknowledges | `lab-processing-start` → [labProcessingStartWorker](internal/workers/labProcessingStartWorker.js) | `{ specimenId, labOrderId }` |
| `lab.test.started` | `labProcessingStartWorker` | *(none — informational / audit trail)* | `{ labOrderId, specimenId, itemIds }` |
| `lab.result.created` | `POST /webhooks/laboratory/results` (via outbox, inside `labResultsService.createResult`) | `result-received` → [resultReceivedWorker](internal/workers/resultReceivedWorker.js) | `{ labResultId, labOrderItemId, laboratoryId, isCritical }` |
| `lab.result.validated` | `POST /lab-results/:id/validate` (via outbox) | `result-notify-validated` → [resultNotifyValidatedWorker](internal/workers/resultNotifyValidatedWorker.js) | `{ labResultId, labOrderItemId, labOrderId, isCritical }` |
| `lab.result.critical` | same validate call, additionally, only when a value is flagged critical | `result-notify-critical` → [resultNotifyCriticalWorker](internal/workers/resultNotifyCriticalWorker.js) | `{ labResultId, labOrderItemId, labOrderId }` |
| `lab.result.failed` | the results webhook, for any test the laboratory reports as failed | `failure-recovery` → [failureRecoveryWorker](internal/workers/failureRecoveryWorker.js) | `{ labOrderItemId, labOrderId, reason }` |

Two events (`specimen.requested`, `lab.test.started`) don't currently have
a consumer of their own — they exist on the bus as observable checkpoints
in the pipeline (and land in `audit_logs`/logs) even though no further
automated action hangs off them today. Adding one is just a new entry in
`CONSUMERS` (topology.js) plus a handler.

## Example flow: a routine (non-critical) result

```
lab.order.created
  → order-validation validates references, order.status = validated
  → lab.order.validated
    → specimen-request creates the specimen, order.status = specimen_requested
      → specimen.requested (audit trail)

POST /lab-orders/:id/collect
  → specimen.collected
    → specimen-dispatch sends the order to the laboratory adapter
      → specimen.received (on ack)
        → lab-processing-start marks items in_progress, order.status = in_progress
          → lab.test.started (audit trail)

[fake laboratory delivers a signed webhook after a simulated delay]

POST /webhooks/laboratory/results
  → lab_results + result_values written, order.status = results_received
  → lab.result.created
    → result-received notifies the clinician a result is available

POST /lab-results/:id/validate
  → lab.result.validated
    → result-notify-validated notifies the clinician the result is ready
  → order.status recomputed to completed once every item is done
```

A critical result runs the same path plus `lab.result.critical` firing
alongside `lab.result.validated`, which pages the clinician by SMS and
email instead of just email.
