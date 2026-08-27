'use strict';

const { getClient } = require('./pool');

/**
 * Runs fn inside a single BEGIN/COMMIT transaction with one dedicated client.
 * fn receives a client with the same .query(text, params) signature as the pool.
 * Rolls back and rethrows on any error so callers never observe a half-applied write.
 */
async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
