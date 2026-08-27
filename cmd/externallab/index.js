'use strict';

const createExternalLabApp = require('../../internal/externallab/app');
const config = require('../../internal/config');
const logger = require('../../internal/logger');

function main() {
  const app = createExternalLabApp();
  const server = app.listen(config.externalLab.port, () => {
    logger.info({ port: config.externalLab.port }, 'fake external laboratory listening');
  });

  function shutdown(signal) {
    logger.info({ signal }, 'fake external laboratory shutting down');
    server.close(() => process.exit(0));
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
