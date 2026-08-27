'use strict';

const express = require('express');
const config = require('../../internal/config');
const logger = require('../../internal/logger');
const db = require('../../internal/db/pool');
const redis = require('../../internal/redis/client');
const amqp = require('../../internal/events/connection');
const { startConsumer } = require('../../internal/events/consumerRunner');
const { startOutboxRelay } = require('../../internal/events/outboxRelay');
const createHealthRouter = require('../../internal/http/routes/health');

const orderValidationWorker = require('../../internal/workers/orderValidationWorker');
const specimenRequestWorker = require('../../internal/workers/specimenRequestWorker');
const specimenDispatchWorker = require('../../internal/workers/specimenDispatchWorker');
const labProcessingStartWorker = require('../../internal/workers/labProcessingStartWorker');
const resultReceivedWorker = require('../../internal/workers/resultReceivedWorker');
const resultNotifyValidatedWorker = require('../../internal/workers/resultNotifyValidatedWorker');
const resultNotifyCriticalWorker = require('../../internal/workers/resultNotifyCriticalWorker');
const failureRecoveryWorker = require('../../internal/workers/failureRecoveryWorker');

const WORKER_HEALTH_PORT = config.port + 1;

const CONSUMER_BINDINGS = [
  ['order-validation', orderValidationWorker.handleOrderCreated],
  ['specimen-request', specimenRequestWorker.handleOrderValidated],
  ['specimen-dispatch', specimenDispatchWorker.handleSpecimenCollected],
  ['lab-processing-start', labProcessingStartWorker.handleSpecimenReceived],
  ['result-received', resultReceivedWorker.handleResultCreated],
  ['result-notify-validated', resultNotifyValidatedWorker.handleResultValidated],
  ['result-notify-critical', resultNotifyCriticalWorker.handleResultCritical],
  ['failure-recovery', failureRecoveryWorker.handleResultFailed],
];

async function main() {
  await amqp.getConnection();

  const consumerChannels = await Promise.all(
    CONSUMER_BINDINGS.map(([name, handler]) => startConsumer(name, handler)),
  );

  const outboxRelay = startOutboxRelay();

  const healthApp = express();
  healthApp.use('/', createHealthRouter({ checkRabbitmq: true }));
  const healthServer = healthApp.listen(WORKER_HEALTH_PORT, () => {
    logger.info({ port: WORKER_HEALTH_PORT }, 'labflow worker health endpoint listening');
  });

  logger.info({ consumers: CONSUMER_BINDINGS.map(([name]) => name) }, 'labflow worker started');

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'worker shutdown signal received');

    const forceExit = setTimeout(() => {
      logger.error('graceful worker shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    try {
      outboxRelay.stop();
      await Promise.all(consumerChannels.map((channel) => channel.close().catch(() => {})));
      await new Promise((resolve) => healthServer.close(resolve));
      await amqp.close();
      await redis.close();
      await db.close();
      logger.info('worker shutdown complete');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during worker shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal error starting worker');
  process.exit(1);
});
