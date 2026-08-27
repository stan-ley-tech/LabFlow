'use strict';

const CircuitBreaker = require('opossum');
const config = require('../config');
const logger = require('../logger');

/**
 * Wraps an async function in a circuit breaker so a struggling dependency
 * (the external lab, in practice) gets failed fast instead of piling up
 * slow requests once it's clearly down. Backoff between attempts is the
 * caller's job (see internal/lib/retry.js) — this only decides whether to
 * attempt the call at all.
 */
function createBreaker(fn, { name, timeout, errorThresholdPercentage, resetTimeout } = {}) {
  const breaker = new CircuitBreaker(fn, {
    timeout: timeout ?? config.reliability.circuitBreakerTimeoutMs,
    errorThresholdPercentage: errorThresholdPercentage ?? config.reliability.circuitBreakerErrorThreshold,
    resetTimeout: resetTimeout ?? config.reliability.circuitBreakerResetTimeoutMs,
  });

  breaker.on('open', () => logger.warn({ breaker: name }, 'circuit breaker open'));
  breaker.on('halfOpen', () => logger.info({ breaker: name }, 'circuit breaker half-open'));
  breaker.on('close', () => logger.info({ breaker: name }, 'circuit breaker closed'));

  return breaker;
}

module.exports = { createBreaker };
