'use strict';

const createApp = require('../../internal/http/app');
const config = require('../../internal/config');
const logger = require('../../internal/logger');
const db = require('../../internal/db/pool');
const redis = require('../../internal/redis/client');

function main() {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'labflow api listening');
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown signal received, draining connections');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(async () => {
      try {
        await redis.close();
        await db.close();
        logger.info('shutdown complete');
        clearTimeout(forceExit);
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'error while closing resources');
        process.exit(1);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
