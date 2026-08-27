'use strict';

const repository = require('../../internal/domain/idempotencyKeys/repository');
const { truncateAll, closeAll } = require('../helpers/db');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

function futureDate() {
  return new Date(Date.now() + 60_000);
}

describe('idempotency keys repository', () => {
  test('claim succeeds for a fresh key and route', async () => {
    const record = await repository.claim({
      idempotencyKey: 'key-1',
      route: 'POST:/lab-orders',
      requestHash: 'hash-1',
      expiresAt: futureDate(),
    });

    expect(record).not.toBeNull();
    expect(record.status).toBe('in_progress');
  });

  test('a second claim for the same key and route returns nothing', async () => {
    await repository.claim({
      idempotencyKey: 'key-2',
      route: 'POST:/lab-orders',
      requestHash: 'hash-1',
      expiresAt: futureDate(),
    });

    const second = await repository.claim({
      idempotencyKey: 'key-2',
      route: 'POST:/lab-orders',
      requestHash: 'hash-1',
      expiresAt: futureDate(),
    });

    expect(second).toBeNull();
  });

  test('the same key is independent across different routes', async () => {
    const a = await repository.claim({
      idempotencyKey: 'shared-key',
      route: 'POST:/lab-orders',
      requestHash: 'hash-a',
      expiresAt: futureDate(),
    });
    const b = await repository.claim({
      idempotencyKey: 'shared-key',
      route: 'POST:/patients',
      requestHash: 'hash-b',
      expiresAt: futureDate(),
    });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a.id).not.toBe(b.id);
  });

  test('complete stores the response for later replay', async () => {
    const record = await repository.claim({
      idempotencyKey: 'key-3',
      route: 'POST:/lab-orders',
      requestHash: 'hash-1',
      expiresAt: futureDate(),
    });

    await repository.complete(record.id, { responseStatus: 201, responseBody: { id: 'order-1' } });

    const fetched = await repository.findByKeyAndRoute('key-3', 'POST:/lab-orders');
    expect(fetched.status).toBe('completed');
    expect(fetched.response_status).toBe(201);
    expect(fetched.response_body).toEqual({ id: 'order-1' });
  });

  test('remove deletes the record so a future attempt can retry cleanly', async () => {
    const record = await repository.claim({
      idempotencyKey: 'key-4',
      route: 'POST:/lab-orders',
      requestHash: 'hash-1',
      expiresAt: futureDate(),
    });

    await repository.remove(record.id);

    const fetched = await repository.findByKeyAndRoute('key-4', 'POST:/lab-orders');
    expect(fetched).toBeNull();
  });
});
