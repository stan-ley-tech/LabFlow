'use strict';

const axios = require('axios');
const LaboratoryAdapter = require('./LaboratoryAdapter');
const { createBreaker } = require('../../lib/circuitBreaker');
const { withRetry } = require('../../lib/retry');
const { UpstreamError } = require('../../lib/errors');
const logger = require('../../logger');

function isPermanentError(err) {
  return Boolean(err.response && err.response.status >= 400 && err.response.status < 500);
}

/**
 * Talks to the in-repo fake external laboratory (cmd/externallab) over
 * plain HTTP, the way a real provider's REST API would be integrated.
 * Wraps the call in a circuit breaker (fail fast once the provider is
 * known-down) and a short retry-with-backoff (ride out a single dropped
 * request); a sustained outage still surfaces as an error, which is what
 * lets the consumer's own retry/dead-letter handling take over.
 */
class FakeHttpLaboratoryAdapter extends LaboratoryAdapter {
  constructor(laboratory) {
    super();
    this.laboratory = laboratory;
    this.client = axios.create({ baseURL: laboratory.base_url, timeout: 4000 });
    this.breaker = createBreaker((payload) => this.sendOrderOnce(payload), {
      name: `laboratory:${laboratory.code}`,
    });
  }

  async sendOrderOnce(payload) {
    const response = await this.client.post('/external/orders', payload);
    return response.data;
  }

  async sendOrder(payload) {
    try {
      return await withRetry(() => this.breaker.fire(payload), {
        retries: 3,
        baseDelayMs: 300,
        maxDelayMs: 4000,
        isRetryable: (err) => !isPermanentError(err),
        onRetry: ({ attempt, delayMs, err }) => {
          logger.warn(
            { attempt, delayMs, err: err.message, laboratory: this.laboratory.code },
            'retrying laboratory send-order',
          );
        },
      });
    } catch (err) {
      throw new UpstreamError(`failed to send order to ${this.laboratory.code}: ${err.message}`);
    }
  }
}

module.exports = FakeHttpLaboratoryAdapter;
