'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, order_number, patient_id, clinician_id, status, priority, notes, created_at, updated_at';

async function create(
  { orderNumber, patientId, clinicianId, priority = 'routine', notes },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO lab_orders (order_number, patient_id, clinician_id, priority, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [orderNumber, patientId, clinicianId, priority, notes || null],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_orders WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByIdForUpdate(id, executor) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_orders WHERE id = $1 FOR UPDATE`, [
    id,
  ]);
  return rows[0] || null;
}

async function updateStatus(id, status, executor) {
  const { rows } = await executor(
    `UPDATE lab_orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return rows[0] || null;
}

async function list({ patientId, status, limit = 25, offset = 0 } = {}, executor = db.query) {
  const clauses = [];
  const params = [];

  if (patientId) {
    params.push(patientId);
    clauses.push(`patient_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM lab_orders ${where}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

module.exports = { create, findById, findByIdForUpdate, updateStatus, list };
