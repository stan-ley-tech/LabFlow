'use strict';

const { getConnection } = require('./connection');
const {
  assertTopology,
  mainQueueName,
  RETRY_EXCHANGE,
  DLX_EXCHANGE,
  CONSUMERS,
} = require('./topology');
const logger = require('../logger');
const context = require('../logger/context');
const deadLetters = require('../domain/deadLetters/repository');

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

/** Exponential backoff with jitter, in milliseconds, for the given attempt number (1-based). */
function computeBackoffMs(attempt) {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitter = Math.random() * exponential * 0.2;
  return Math.round(exponential - jitter / 2 + jitter);
}

function getRetryCount(msg) {
  const headers = msg.properties.headers || {};
  return typeof headers['x-retry-count'] === 'number' ? headers['x-retry-count'] : 0;
}

async function handleFailure(channel, name, consumerConfig, msg, envelope, err) {
  const retryCount = getRetryCount(msg);
  const nextAttempt = retryCount + 1;

  logger.warn(
    { consumer: name, retryCount, maxRetries: consumerConfig.maxRetries, err: err.message },
    'consumer handler failed',
  );

  if (nextAttempt > consumerConfig.maxRetries) {
    await deadLetters.create({
      queueName: mainQueueName(name),
      routingKey: consumerConfig.routingKey,
      payload: envelope,
      headers: msg.properties.headers || {},
      errorMessage: err.message,
    });

    channel.publish(DLX_EXCHANGE, name, msg.content, {
      persistent: true,
      headers: {
        ...msg.properties.headers,
        'x-retry-count': retryCount,
        'x-final-error': err.message,
      },
    });
    channel.ack(msg);
    logger.error(
      { consumer: name, eventId: envelope.eventId },
      'retries exhausted, moved message to dead-letter queue',
    );
    return;
  }

  const delayMs = computeBackoffMs(nextAttempt);
  channel.publish(RETRY_EXCHANGE, name, msg.content, {
    persistent: true,
    expiration: String(delayMs),
    headers: { ...msg.properties.headers, 'x-retry-count': nextAttempt },
  });
  channel.ack(msg);
}

async function handleMessage(channel, name, consumerConfig, msg, handler) {
  let envelope;
  try {
    envelope = JSON.parse(msg.content.toString('utf8'));
  } catch (err) {
    logger.error({ err, consumer: name }, 'discarding unparseable message');
    channel.ack(msg);
    return;
  }

  try {
    await context.run(
      { correlationId: envelope.correlationId, requestId: envelope.eventId },
      () => handler(envelope.data, envelope),
    );
    channel.ack(msg);
  } catch (err) {
    await handleFailure(channel, name, consumerConfig, msg, envelope, err);
  }
}

/**
 * Subscribes to a consumer's main queue (see topology.js for the name ->
 * routing key mapping) and runs handler(data, envelope) per message. A
 * handler that throws triggers the retry/dead-letter flow documented in
 * topology.js instead of crashing the process or silently dropping work.
 */
async function startConsumer(name, handler, { prefetch = 10 } = {}) {
  const consumerConfig = CONSUMERS.find((c) => c.name === name);
  if (!consumerConfig) {
    throw new Error(`unknown consumer: ${name}`);
  }

  const connection = await getConnection();
  const channel = await connection.createConfirmChannel();
  await assertTopology(channel);
  await channel.prefetch(prefetch);

  const queue = mainQueueName(name);

  await channel.consume(queue, (msg) => {
    if (!msg) return;
    handleMessage(channel, name, consumerConfig, msg, handler).catch((err) => {
      logger.error({ err, consumer: name }, 'unexpected error in consumer message loop');
    });
  });

  logger.info({ consumer: name, queue }, 'consumer started');
  return channel;
}

module.exports = { startConsumer, computeBackoffMs, getRetryCount, handleFailure, handleMessage };
