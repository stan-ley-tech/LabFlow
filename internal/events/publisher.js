'use strict';

const { v4: uuidv4 } = require('uuid');
const { getConnection } = require('./connection');
const { assertTopology, MAIN_EXCHANGE } = require('./topology');
const { getCorrelationId } = require('../logger/context');
const logger = require('../logger');

let channelPromise = null;

async function getPublishChannel() {
  if (!channelPromise) {
    channelPromise = (async () => {
      const connection = await getConnection();
      const channel = await connection.createConfirmChannel();
      await assertTopology(channel);
      channel.on('close', () => {
        channelPromise = null;
      });
      return channel;
    })().catch((err) => {
      channelPromise = null;
      throw err;
    });
  }
  return channelPromise;
}

/**
 * Publishes a single domain event to the main topic exchange, routed by
 * eventType. Resolves once the broker has confirmed the publish (publisher
 * confirms), so callers know the message actually made it onto the broker
 * rather than just into a TCP buffer.
 */
async function publishEvent({ eventType, aggregateType, aggregateId, data, correlationId }) {
  const channel = await getPublishChannel();

  const envelope = {
    eventId: uuidv4(),
    eventType,
    aggregateType,
    aggregateId,
    occurredAt: new Date().toISOString(),
    correlationId: correlationId || getCorrelationId() || null,
    data,
  };

  const buffer = Buffer.from(JSON.stringify(envelope));

  await new Promise((resolve, reject) => {
    channel.publish(
      MAIN_EXCHANGE,
      eventType,
      buffer,
      {
        persistent: true,
        contentType: 'application/json',
        messageId: envelope.eventId,
        headers: { 'x-retry-count': 0 },
      },
      (err) => (err ? reject(err) : resolve()),
    );
  });

  logger.debug({ eventType, aggregateId, eventId: envelope.eventId }, 'published event');
  return envelope;
}

module.exports = { publishEvent, getPublishChannel };
