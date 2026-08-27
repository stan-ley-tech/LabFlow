'use strict';

const { recomputeOrderStatus } = require('../../internal/domain/labOrders/statusEngine');

function fakeClient(itemStatuses) {
  const queries = [];
  return {
    queries,
    async query(text, params) {
      queries.push({ text, params });
      if (text.includes('SELECT status FROM lab_order_items')) {
        return { rows: itemStatuses.map((status) => ({ status })) };
      }
      return { rows: [] };
    },
  };
}

describe('recomputeOrderStatus', () => {
  test('does nothing when the order has no items', async () => {
    const client = fakeClient([]);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBeNull();
    expect(client.queries).toHaveLength(1); // only the SELECT, no UPDATE
  });

  test('leaves the order alone while every item is still pending or in progress', async () => {
    const client = fakeClient(['pending', 'in_progress']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBeNull();
    expect(client.queries).toHaveLength(1);
  });

  test('moves to results_received as soon as one item finishes, even if another is still in progress', async () => {
    const client = fakeClient(['completed', 'in_progress']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBe('results_received');
  });

  test('marks the order completed once every item is completed', async () => {
    const client = fakeClient(['completed', 'completed']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBe('completed');
    expect(client.queries[1].params).toEqual(['order-1', 'completed']);
  });

  test('marks the order failed once every item has failed', async () => {
    const client = fakeClient(['failed', 'failed']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBe('failed');
  });

  test('marks results_received once at least one item finished, even if others are pending', async () => {
    const client = fakeClient(['completed', 'pending']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBe('results_received');
  });

  test('a mix of completed and failed items, with nothing pending, resolves to results_received', async () => {
    const client = fakeClient(['completed', 'failed']);
    const result = await recomputeOrderStatus('order-1', client);
    expect(result).toBe('results_received');
  });
});
