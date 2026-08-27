'use strict';

const { startConsumer } = require('../../internal/events/consumerRunner');
const { publishEvent } = require('../../internal/events/publisher');
const { getConnection, close: closeAmqp } = require('../../internal/events/connection');
const { mainQueueName, retryQueueName, dlqName, EVENTS } = require('../../internal/events/topology');
const { assertTopology } = require('../../internal/events/topology');
const { closeAll } = require('../helpers/db');
const { waitFor } = require('../helpers/wait');

let openChannels = [];

afterEach(async () => {
  await Promise.all(openChannels.map((ch) => ch.close().catch(() => {})));
  openChannels = [];
});

afterAll(async () => {
  await closeAmqp();
  await closeAll();
});

async function purgeConsumerQueues(name) {
  const connection = await getConnection();
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.purgeQueue(mainQueueName(name));
  await channel.purgeQueue(retryQueueName(name));
  await channel.purgeQueue(dlqName(name));
  await channel.close();
}

describe('consumerRunner against a real broker', () => {
  test('a published event reaches the bound consumer and is acknowledged', async () => {
    await purgeConsumerQueues('failure-recovery');

    const received = [];
    const channel = await startConsumer('failure-recovery', async (data) => {
      received.push(data);
    });
    openChannels.push(channel);

    await publishEvent({
      eventType: EVENTS.RESULT_FAILED,
      aggregateType: 'lab_order_item',
      aggregateId: 'item-1',
      data: { labOrderItemId: 'item-1', reason: 'test' },
    });

    await waitFor(() => received.length > 0, { timeoutMs: 5000 });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ labOrderItemId: 'item-1' });
  }, 15000);

  test('a handler that fails once is retried and succeeds on redelivery via the real retry queue', async () => {
    await purgeConsumerQueues('failure-recovery');

    let attempts = 0;
    const channel = await startConsumer('failure-recovery', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('simulated transient failure');
      }
    });
    openChannels.push(channel);

    await publishEvent({
      eventType: EVENTS.RESULT_FAILED,
      aggregateType: 'lab_order_item',
      aggregateId: 'item-2',
      data: { labOrderItemId: 'item-2' },
    });

    await waitFor(() => attempts >= 2, { timeoutMs: 8000 });

    expect(attempts).toBe(2);
  }, 15000);
});
