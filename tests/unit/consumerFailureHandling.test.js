'use strict';

jest.mock('../../internal/domain/deadLetters/repository', () => ({
  create: jest.fn().mockResolvedValue({ id: 'dead-letter-1' }),
}));

const { handleMessage } = require('../../internal/events/consumerRunner');
const { RETRY_EXCHANGE, DLX_EXCHANGE } = require('../../internal/events/topology');
const deadLetters = require('../../internal/domain/deadLetters/repository');

function fakeChannel() {
  return { publish: jest.fn(), ack: jest.fn() };
}

function fakeMessage(envelope, retryCount = 0) {
  return {
    content: Buffer.from(JSON.stringify(envelope)),
    properties: { headers: { 'x-retry-count': retryCount } },
  };
}

const consumerConfig = { name: 'test-consumer', routingKey: 'test.event', maxRetries: 2 };
const envelope = { eventId: 'evt-1', eventType: 'test.event', data: { foo: 'bar' } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleMessage success path', () => {
  test('acks the message and never touches the retry or DLX exchange', async () => {
    const channel = fakeChannel();
    const handler = jest.fn().mockResolvedValue(undefined);
    const msg = fakeMessage(envelope);

    await handleMessage(channel, 'test-consumer', consumerConfig, msg, handler);

    expect(handler).toHaveBeenCalledWith(envelope.data, envelope);
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.publish).not.toHaveBeenCalled();
  });
});

describe('handleMessage failure path', () => {
  test('republishes to the retry exchange with an incremented retry count while under maxRetries', async () => {
    const channel = fakeChannel();
    const handler = jest.fn().mockRejectedValue(new Error('transient failure'));
    const msg = fakeMessage(envelope, 0);

    await handleMessage(channel, 'test-consumer', consumerConfig, msg, handler);

    expect(channel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, , options] = channel.publish.mock.calls[0];
    expect(exchange).toBe(RETRY_EXCHANGE);
    expect(routingKey).toBe('test-consumer');
    expect(options.headers['x-retry-count']).toBe(1);
    expect(options.expiration).toEqual(expect.any(String));
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(deadLetters.create).not.toHaveBeenCalled();
  });

  test('parks the message in the DLX once maxRetries is exceeded', async () => {
    const channel = fakeChannel();
    const handler = jest.fn().mockRejectedValue(new Error('persistent failure'));
    const msg = fakeMessage(envelope, consumerConfig.maxRetries); // already at the limit

    await handleMessage(channel, 'test-consumer', consumerConfig, msg, handler);

    expect(deadLetters.create).toHaveBeenCalledTimes(1);
    expect(deadLetters.create.mock.calls[0][0]).toMatchObject({
      routingKey: 'test.event',
      errorMessage: 'persistent failure',
    });

    expect(channel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey] = channel.publish.mock.calls[0];
    expect(exchange).toBe(DLX_EXCHANGE);
    expect(routingKey).toBe('test-consumer');
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  test('a message that never succeeds is retried exactly maxRetries times before parking', async () => {
    const channel = fakeChannel();
    const handler = jest.fn().mockRejectedValue(new Error('always fails'));

    // Simulate the message coming back around through the retry queue each
    // time, exactly as consumerRunner's own topology would redeliver it.
    let retryCount = 0;
    let landedInDlx = false;

    for (let hop = 0; hop < consumerConfig.maxRetries + 1; hop += 1) {
      const msg = fakeMessage(envelope, retryCount);
      // eslint-disable-next-line no-await-in-loop
      await handleMessage(channel, 'test-consumer', consumerConfig, msg, handler);

      const lastCall = channel.publish.mock.calls[channel.publish.mock.calls.length - 1];
      if (lastCall[0] === DLX_EXCHANGE) {
        landedInDlx = true;
        break;
      }
      retryCount = lastCall[3].headers['x-retry-count'];
    }

    expect(landedInDlx).toBe(true);
    expect(handler).toHaveBeenCalledTimes(consumerConfig.maxRetries + 1);
    expect(deadLetters.create).toHaveBeenCalledTimes(1);
  });

  test('an unparseable message is acked and dropped rather than retried forever', async () => {
    const channel = fakeChannel();
    const handler = jest.fn();
    const msg = { content: Buffer.from('not json'), properties: { headers: {} } };

    await handleMessage(channel, 'test-consumer', consumerConfig, msg, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.publish).not.toHaveBeenCalled();
  });
});
