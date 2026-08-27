'use strict';

const db = require('../../db/pool');

async function findByKeyAndRoute(idempotencyKey, route, executor = db.query) {
  const { rows } = await executor(
    'SELECT * FROM idempotency_keys WHERE idempotency_key = $1 AND route = $2',
    [idempotencyKey, route],
  );
  return rows[0] || null;
}

async function claim({ idempotencyKey, route, requestHash, expiresAt }, executor = db.query) {
  const { rows } = await executor(
    `INSERT INTO idempotency_keys (idempotency_key, route, request_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key, route) DO NOTHING
     RETURNING *`,
    [idempotencyKey, route, requestHash, expiresAt],
  );
  return rows[0] || null;
}

async function complete(id, { responseStatus, responseBody }, executor = db.query) {
  await executor(
    `UPDATE idempotency_keys
     SET status = 'completed', response_status = $2, response_body = $3, updated_at = now()
     WHERE id = $1`,
    [id, responseStatus, JSON.stringify(responseBody)],
  );
}

async function remove(id, executor = db.query) {
  await executor('DELETE FROM idempotency_keys WHERE id = $1', [id]);
}

module.exports = { findByKeyAndRoute, claim, complete, remove };
