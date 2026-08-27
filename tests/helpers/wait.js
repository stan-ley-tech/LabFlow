'use strict';

/** Polls predicate() until it returns truthy, or rejects after timeoutMs. */
async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 100 } = {}) {
  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = { waitFor };
