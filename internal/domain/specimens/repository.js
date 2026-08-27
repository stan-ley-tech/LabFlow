'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, lab_order_id, barcode, specimen_type, status, collected_by, collected_at, received_at, rejection_reason, created_at, updated_at';

async function create({ labOrderId, barcode, specimenType }, executor) {
  const { rows } = await executor(
    `INSERT INTO specimens (lab_order_id, barcode, specimen_type)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [labOrderId, barcode, specimenType],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM specimens WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByLabOrderId(labOrderId, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM specimens WHERE lab_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [labOrderId],
  );
  return rows[0] || null;
}

async function findByLabOrderIdForUpdate(labOrderId, executor) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM specimens WHERE lab_order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [labOrderId],
  );
  return rows[0] || null;
}

async function updateStatus(id, status, fields = {}, executor) {
  const setClauses = ['status = $2', 'updated_at = now()'];
  const params = [id, status];

  if (fields.collectedBy !== undefined) {
    params.push(fields.collectedBy);
    setClauses.push(`collected_by = $${params.length}`);
  }
  if (fields.collectedAt !== undefined) {
    params.push(fields.collectedAt);
    setClauses.push(`collected_at = $${params.length}`);
  }
  if (fields.receivedAt !== undefined) {
    params.push(fields.receivedAt);
    setClauses.push(`received_at = $${params.length}`);
  }
  if (fields.rejectionReason !== undefined) {
    params.push(fields.rejectionReason);
    setClauses.push(`rejection_reason = $${params.length}`);
  }

  const { rows } = await executor(
    `UPDATE specimens SET ${setClauses.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    params,
  );
  return rows[0] || null;
}

module.exports = { create, findById, findByLabOrderId, findByLabOrderIdForUpdate, updateStatus };
