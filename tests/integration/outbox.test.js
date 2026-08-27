'use strict';

const { withTransaction } = require('../../internal/db/transaction');
const outbox = require('../../internal/events/outbox');
const { relayOnce } = require('../../internal/events/outboxRelay');
const { getConnection, close: closeAmqp } = require('../../internal/events/connection');
const { truncateAll, closeAll } = require('../helpers/db');
const db = require('../../internal/db/pool');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAmqp();
  await closeAll();
});

describe('transactional outbox', () => {
  test('enqueue writes a pending row inside the caller transaction', async () => {
    await withTransaction(async (client) => {
      await outbox.enqueue(client, {
        aggregateType: 'lab_order',
        aggregateId: '11111111-1111-1111-1111-111111111111',
        eventType: 'lab.order.created',
        payload: { hello: 'world' },
      });
    });

    const { rows } = await db.query('SELECT * FROM outbox_events');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].event_type).toBe('lab.order.created');
  });

  test('a rolled-back transaction leaves no outbox row behind', async () => {
    await expect(
      withTransaction(async (client) => {
        await outbox.enqueue(client, {
          aggregateType: 'lab_order',
          aggregateId: '11111111-1111-1111-1111-111111111111',
          eventType: 'lab.order.created',
          payload: {},
        });
        throw new Error('simulated failure after the outbox write');
      }),
    ).rejects.toThrow('simulated failure');

    const { rows } = await db.query('SELECT * FROM outbox_events');
    expect(rows).toHaveLength(0);
  });

  test('relayOnce publishes pending rows to RabbitMQ and marks them published', async () => {
    await getConnection();

    await withTransaction(async (client) => {
      await outbox.enqueue(client, {
        aggregateType: 'lab_order',
        aggregateId: '22222222-2222-2222-2222-222222222222',
        eventType: 'lab.order.created',
        payload: { orderNumber: 'ORD-TEST' },
      });
    });

    const published = await relayOnce();
    expect(published).toBeGreaterThanOrEqual(1);

    const { rows } = await db.query(
      "SELECT status, published_at FROM outbox_events WHERE aggregate_id = $1",
      ['22222222-2222-2222-2222-222222222222'],
    );
    expect(rows[0].status).toBe('published');
    expect(rows[0].published_at).not.toBeNull();
  });
});
