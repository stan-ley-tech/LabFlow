'use strict';

const { getCorrelationId } = require('../logger/context');

/**
 * Records an event to be published inside the caller's transaction. Must be
 * called with the same client used for the domain write so the business
 * change and the fact that an event needs publishing commit atomically —
 * that's the whole point of the outbox pattern (see migrations/0015).
 */
async function enqueue(client, { aggregateType, aggregateId, eventType, payload, correlationId }) {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, correlation_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [aggregateType, aggregateId, eventType, JSON.stringify(payload), correlationId || getCorrelationId() || null],
  );
}

module.exports = { enqueue };
