'use strict';

const { computeBackoffMs, getRetryCount } = require('../../internal/events/consumerRunner');

// Mirrors the exponential formula in consumerRunner.js: base * 2^(attempt-1),
// capped at 60000, plus up to 10% jitter on top.
function expectedRange(attempt) {
  const exponential = Math.min(60000, 1000 * 2 ** (attempt - 1));
  return { min: exponential, max: exponential * 1.1 };
}

describe('computeBackoffMs', () => {
  test.each([1, 2, 3, 4, 5])('attempt %i falls within the expected exponential range', (attempt) => {
    const { min, max } = expectedRange(attempt);
    const delay = computeBackoffMs(attempt);
    expect(delay).toBeGreaterThanOrEqual(min);
    expect(delay).toBeLessThanOrEqual(max);
  });

  test('caps at the configured maximum for large attempt numbers', () => {
    const delay = computeBackoffMs(20);
    expect(delay).toBeGreaterThanOrEqual(60000);
    expect(delay).toBeLessThanOrEqual(66000);
  });
});

describe('getRetryCount', () => {
  test('reads x-retry-count from message headers', () => {
    const msg = { properties: { headers: { 'x-retry-count': 3 } } };
    expect(getRetryCount(msg)).toBe(3);
  });

  test('defaults to 0 when the header is missing', () => {
    const msg = { properties: { headers: {} } };
    expect(getRetryCount(msg)).toBe(0);
  });

  test('defaults to 0 when there are no headers at all', () => {
    const msg = { properties: {} };
    expect(getRetryCount(msg)).toBe(0);
  });
});
