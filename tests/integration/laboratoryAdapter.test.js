'use strict';

/**
 * Simulates "the laboratory API is down": point the adapter at a port
 * nothing is listening on and confirm it retries a bounded number of times
 * before surfacing a single UpstreamError, rather than hanging or crashing
 * the calling worker. A sustained outage (this test) versus a brief one
 * (tests/unit/retry.test.js, which asserts the retry actually succeeds
 * once the dependency recovers) are the two halves of the same story.
 */

const FakeHttpLaboratoryAdapter = require('../../internal/adapters/laboratory/FakeHttpLaboratoryAdapter');
const { UpstreamError } = require('../../internal/lib/errors');

describe('FakeHttpLaboratoryAdapter against an unreachable laboratory', () => {
  test('exhausts its retries and throws a single UpstreamError', async () => {
    const laboratory = {
      id: 'lab-down-1',
      code: 'DOWN_LAB',
      base_url: 'http://127.0.0.1:4999', // nothing listens here
    };
    const adapter = new FakeHttpLaboratoryAdapter(laboratory);

    const start = Date.now();
    await expect(
      adapter.sendOrder({ labOrderId: 'order-1', orderNumber: 'ORD-1', tests: [] }),
    ).rejects.toThrow(UpstreamError);
    const elapsedMs = Date.now() - start;

    // Bounded: retries backoff at most a few seconds, this should never
    // approach the 30s test timeout let alone hang indefinitely.
    expect(elapsedMs).toBeLessThan(15000);
  }, 20000);
});
