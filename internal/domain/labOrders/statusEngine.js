'use strict';

/**
 * Derives the order's overall status from its items' statuses rather than
 * setting it directly wherever an item changes — with multiple tests per
 * order progressing independently, this is the one place that decides what
 * "the order" is doing as a whole.
 */
async function recomputeOrderStatus(labOrderId, client) {
  const { rows } = await client.query('SELECT status FROM lab_order_items WHERE lab_order_id = $1', [
    labOrderId,
  ]);
  if (rows.length === 0) return null;

  const statuses = rows.map((r) => r.status);
  let nextStatus = null;

  if (statuses.every((s) => s === 'completed')) {
    nextStatus = 'completed';
  } else if (statuses.every((s) => s === 'failed')) {
    nextStatus = 'failed';
  } else if (statuses.some((s) => s === 'completed' || s === 'failed')) {
    nextStatus = 'results_received';
  }

  if (nextStatus) {
    await client.query('UPDATE lab_orders SET status = $2, updated_at = now() WHERE id = $1', [
      labOrderId,
      nextStatus,
    ]);
  }

  return nextStatus;
}

module.exports = { recomputeOrderStatus };
