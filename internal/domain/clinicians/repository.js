'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, license_number, first_name, last_name, email, phone, department, is_active, created_at, updated_at';

async function create(
  { licenseNumber, firstName, lastName, email, phone, department },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO clinicians (license_number, first_name, last_name, email, phone, department)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [licenseNumber, firstName, lastName, email, phone || null, department || null],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM clinicians WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function list({ limit = 25, offset = 0 } = {}, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM clinicians ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

module.exports = { create, findById, list };
