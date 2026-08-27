'use strict';

const { Router } = require('express');
const db = require('../../db/pool');
const redis = require('../../redis/client');
const amqp = require('../../events/connection');

/**
 * checkRabbitmq should only be true for processes that actually hold (or
 * are expected to hold) an amqp connection, i.e. the worker. The API
 * process writes to the transactional outbox and never talks to RabbitMQ
 * directly (see internal/events/outboxRelay.js), so its readiness is
 * intentionally independent of broker availability.
 */
function createHealthRouter({ checkRabbitmq = false } = {}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const checks = { postgres: false, redis: false };
    if (checkRabbitmq) checks.rabbitmq = false;

    await Promise.allSettled([
      db.query('SELECT 1').then(() => {
        checks.postgres = true;
      }),
      redis.ping().then(() => {
        checks.redis = true;
      }),
    ]);

    if (checkRabbitmq) checks.rabbitmq = amqp.isConnected();

    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
  });

  return router;
}

module.exports = createHealthRouter;
