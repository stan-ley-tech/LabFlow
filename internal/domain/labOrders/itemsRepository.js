'use strict';

const db = require('../../db/pool');

const COLUMNS = 'id, lab_order_id, lab_test_id, status, created_at, updated_at';

async function createMany(labOrderId, labTestIds, executor) {
  const rows = [];
  for (const labTestId of labTestIds) {
    // eslint-disable-next-line no-await-in-loop
    const { rows: inserted } = await executor(
      `INSERT INTO lab_order_items (lab_order_id, lab_test_id)
       VALUES ($1, $2)
       RETURNING ${COLUMNS}`,
      [labOrderId, labTestId],
    );
    rows.push(inserted[0]);
  }
  return rows;
}

async function listByOrderId(labOrderId, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM lab_order_items WHERE lab_order_id = $1 ORDER BY created_at`,
    [labOrderId],
  );
  return rows;
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_order_items WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function updateStatus(id, status, executor) {
  const { rows } = await executor(
    `UPDATE lab_order_items SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return rows[0] || null;
}

module.exports = { createMany, listByOrderId, findById, updateStatus };
