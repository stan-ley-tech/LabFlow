'use strict';

const { withRetry } = require('../../internal/lib/retry');

describe('withRetry', () => {
  test('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { retries: 3, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const onRetry = jest.fn();
    const result = await withRetry(fn, { retries: 3, baseDelayMs: 1, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1 });
    expect(onRetry.mock.calls[1][0]).toMatchObject({ attempt: 2 });
  });

  test('throws the last error once retries are exhausted', async () => {
    const err = new Error('permanent failure');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow(
      'permanent failure',
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  test('does not retry when isRetryable returns false', async () => {
    const err = new Error('not retryable');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { retries: 5, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
