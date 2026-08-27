'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, lab_order_item_id, laboratory_id, status, is_critical, performed_at, validated_at, validated_by, created_at, updated_at';

async function create({ labOrderItemId, laboratoryId, isCritical = false }, executor) {
  const { rows } = await executor(
    `INSERT INTO lab_results (lab_order_item_id, laboratory_id, is_critical)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [labOrderItemId, laboratoryId, isCritical],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_results WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByIdForUpdate(id, executor) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_results WHERE id = $1 FOR UPDATE`, [
    id,
  ]);
  return rows[0] || null;
}

async function findByOrderItemId(labOrderItemId, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_results WHERE lab_order_item_id = $1`, [
    labOrderItemId,
  ]);
  return rows[0] || null;
}

async function markValidated(id, { validatedBy }, executor) {
  const { rows } = await executor(
    `UPDATE lab_results
     SET status = 'validated', validated_at = now(), validated_by = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, validatedBy],
  );
  return rows[0] || null;
}

async function findByPatientId(patientId, executor = db.query) {
  const { rows } = await executor(
    `SELECT
       r.id, r.lab_order_item_id, r.laboratory_id, r.status, r.is_critical,
       r.performed_at, r.validated_at, r.validated_by, r.created_at, r.updated_at,
       oi.lab_order_id, oi.lab_test_id, t.name AS test_name, t.code AS test_code
     FROM lab_results r
     JOIN lab_order_items oi ON oi.id = r.lab_order_item_id
     JOIN lab_orders o ON o.id = oi.lab_order_id
     JOIN lab_tests t ON t.id = oi.lab_test_id
     WHERE o.patient_id = $1
     ORDER BY r.created_at DESC`,
    [patientId],
  );
  return rows;
}

module.exports = { create, findById, findByIdForUpdate, findByOrderItemId, markValidated, findByPatientId };
