'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, code, name, specimen_type, turnaround_hours, is_active, created_at, updated_at';

async function create(
  { code, name, specimenType, turnaroundHours = 24 },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO lab_tests (code, name, specimen_type, turnaround_hours)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [code, name, specimenType, turnaroundHours],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_tests WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByIds(ids, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_tests WHERE id = ANY($1::uuid[])`, [
    ids,
  ]);
  return rows;
}

async function findByCode(code, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM lab_tests WHERE code = $1`, [code]);
  return rows[0] || null;
}

async function list({ activeOnly = true, limit = 50, offset = 0 } = {}, executor = db.query) {
  const clause = activeOnly ? 'WHERE is_active = true' : '';
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM lab_tests ${clause} ORDER BY name LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

module.exports = { create, findById, findByIds, findByCode, list };
