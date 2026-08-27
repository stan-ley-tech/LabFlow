'use strict';

const { withTransaction } = require('../db/transaction');
const { publishEvent } = require('./publisher');
const config = require('../config');
const logger = require('../logger');

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 10;

async function relayOnce() {
  let publishedCount = 0;

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, aggregate_type, aggregate_id, event_type, payload, correlation_id, attempt_count
       FROM outbox_events
       WHERE status = 'pending'
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );

    for (const row of rows) {
      try {
        await publishEvent({
          eventType: row.event_type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          data: row.payload,
          correlationId: row.correlation_id,
        });
        await client.query(
          "UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1",
          [row.id],
        );
        publishedCount += 1;
      } catch (err) {
        logger.error({ err, outboxEventId: row.id }, 'failed to publish outbox event');
        const attemptCount = row.attempt_count + 1;
        const status = attemptCount >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await client.query('UPDATE outbox_events SET attempt_count = $2, status = $3 WHERE id = $1', [
          row.id,
          attemptCount,
          status,
        ]);
      }
    }
  });

  return publishedCount;
}

/**
 * Polls outbox_events on an interval and publishes pending rows to
 * RabbitMQ. Runs in the worker process only — the API process just writes
 * rows inside its own transactions and leaves delivery to this loop, which
 * keeps request latency independent of broker availability.
 */
function startOutboxRelay({ intervalMs = config.reliability.outboxRelayIntervalMs } = {}) {
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const count = await relayOnce();
      if (count > 0) logger.debug({ count }, 'outbox relay published batch');
    } catch (err) {
      logger.error({ err }, 'outbox relay tick failed');
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  timer = setTimeout(tick, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = { startOutboxRelay, relayOnce };
