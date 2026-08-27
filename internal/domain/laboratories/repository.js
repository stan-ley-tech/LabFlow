'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, code, name, adapter_type, base_url, webhook_secret, is_active, created_at, updated_at';

async function create(
  { code, name, adapterType = 'fake_http', baseUrl, webhookSecret },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO laboratories (code, name, adapter_type, base_url, webhook_secret)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [code, name, adapterType, baseUrl, webhookSecret],
  );
  return rows[0];
}

async function findById(id, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM laboratories WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByCode(code, executor = db.query) {
  const { rows } = await executor(`SELECT ${COLUMNS} FROM laboratories WHERE code = $1`, [code]);
  return rows[0] || null;
}

async function list({ activeOnly = true } = {}, executor = db.query) {
  const clause = activeOnly ? 'WHERE is_active = true' : '';
  const { rows } = await executor(`SELECT ${COLUMNS} FROM laboratories ${clause} ORDER BY name`);
  return rows;
}

module.exports = { create, findById, findByCode, list };
