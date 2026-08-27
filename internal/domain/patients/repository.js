'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, mrn, first_name, last_name, date_of_birth, sex, phone, email, address, created_at, updated_at';

async function create(
  { mrn, firstName, lastName, dateOfBirth, sex, phone, email, address },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex, phone, email, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [mrn, firstName, lastName, dateOfBirth, sex, phone || null, email || null, address || null],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM patients WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByMrn(mrn, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM patients WHERE mrn = $1`, [mrn]);
  return rows[0] || null;
}

async function list({ limit = 25, offset = 0 } = {}, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM patients ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

module.exports = { create, findById, findByMrn, list };
