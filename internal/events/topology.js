'use strict';

// Routing keys are the event catalog for the system — see EVENTS.md.
const EVENTS = {
  ORDER_CREATED: 'lab.order.created',
  ORDER_VALIDATED: 'lab.order.validated',
  SPECIMEN_REQUESTED: 'specimen.requested',
  SPECIMEN_COLLECTED: 'specimen.collected',
  SPECIMEN_RECEIVED: 'specimen.received',
  TEST_STARTED: 'lab.test.started',
  RESULT_CREATED: 'lab.result.created',
  RESULT_VALIDATED: 'lab.result.validated',
  RESULT_CRITICAL: 'lab.result.critical',
  RESULT_FAILED: 'lab.result.failed',
};

const MAIN_EXCHANGE = 'labflow.events';
const RETRY_EXCHANGE = 'labflow.events.retry';
const DLX_EXCHANGE = 'labflow.events.dlx';

// One queue per consumer, each bound to exactly one routing key. Keeping it
// 1:1 means a retry queue can dead-letter straight back to the routing key
// it came from instead of needing to remember it per message.
const CONSUMERS = [
  { name: 'order-validation', routingKey: EVENTS.ORDER_CREATED, maxRetries: 5 },
  { name: 'specimen-request', routingKey: EVENTS.ORDER_VALIDATED, maxRetries: 5 },
  { name: 'specimen-dispatch', routingKey: EVENTS.SPECIMEN_COLLECTED, maxRetries: 5 },
  { name: 'lab-processing-start', routingKey: EVENTS.SPECIMEN_RECEIVED, maxRetries: 5 },
  { name: 'result-received', routingKey: EVENTS.RESULT_CREATED, maxRetries: 5 },
  { name: 'result-notify-validated', routingKey: EVENTS.RESULT_VALIDATED, maxRetries: 5 },
  { name: 'result-notify-critical', routingKey: EVENTS.RESULT_CRITICAL, maxRetries: 8 },
  { name: 'failure-recovery', routingKey: EVENTS.RESULT_FAILED, maxRetries: 5 },
];

function mainQueueName(name) {
  return `labflow.q.${name}`;
}

function retryQueueName(name) {
  return `labflow.q.${name}.retry`;
}

function dlqName(name) {
  return `labflow.q.${name}.dlq`;
}

/**
 * Declares the full exchange/queue graph. Idempotent — safe to call on every
 * process startup (server, worker, tests) since amqplib's assert* calls are
 * no-ops when the topology already matches.
 *
 * Retry flow per consumer:
 *   main queue --(handler throws)--> retry exchange --(per-message TTL)-->
 *   retry queue --(TTL expires, dead-letters)--> main exchange --(same
 *   routing key)--> main queue. Once a message has been retried maxRetries
 *   times, the consumer publishes it to the DLX instead of the retry
 *   exchange, where it lands in a queue nothing consumes from — final
 *   parking, inspectable via the dead_letters table and the queue itself.
 */
async function assertTopology(channel) {
  await channel.assertExchange(MAIN_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

  for (const consumer of CONSUMERS) {
    const main = mainQueueName(consumer.name);
    const retry = retryQueueName(consumer.name);
    const dlq = dlqName(consumer.name);

    await channel.assertQueue(main, { durable: true });
    await channel.bindQueue(main, MAIN_EXCHANGE, consumer.routingKey);

    await channel.assertQueue(retry, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': MAIN_EXCHANGE,
        'x-dead-letter-routing-key': consumer.routingKey,
      },
    });
    await channel.bindQueue(retry, RETRY_EXCHANGE, consumer.name);

    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, DLX_EXCHANGE, consumer.name);
  }
}

module.exports = {
  EVENTS,
  MAIN_EXCHANGE,
  RETRY_EXCHANGE,
  DLX_EXCHANGE,
  CONSUMERS,
  mainQueueName,
  retryQueueName,
  dlqName,
  assertTopology,
};
