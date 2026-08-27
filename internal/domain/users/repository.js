'use strict';

const db = require('../../db/pool');

const COLUMNS = 'id, email, password_hash, full_name, role, clinician_id, is_active, created_at, updated_at';

async function create({ email, passwordHash, fullName, role, clinicianId = null }, executor = db.query) {
  const { rows } = await executor(
    `INSERT INTO users (email, password_hash, full_name, role, clinician_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [email, passwordHash, fullName, role, clinicianId],
  );
  return rows[0];
}

async function findByEmail(email, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { create, findByEmail, findById };
