'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff and jitter.
 * Throws the last error once retries are exhausted so the caller decides
 * what happens next (dead-letter, mark failed, surface to the user, ...).
 */
async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    isRetryable = () => true,
    onRetry = () => {},
  } = options;

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) {
        throw err;
      }

      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * exponential * 0.2;
      const delayMs = Math.round(exponential - jitter / 2 + jitter);

      onRetry({ attempt, delayMs, err });
      await sleep(delayMs);
    }
  }
}

module.exports = { withRetry, sleep };
