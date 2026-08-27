'use strict';

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../logger');

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(attempt) {
    return Math.min(attempt * 200, 5000);
  },
});

redis.on('error', (err) => {
  logger.error({ err }, 'redis client error');
});

async function close() {
  await redis.quit();
}

module.exports = redis;
module.exports.close = close;
