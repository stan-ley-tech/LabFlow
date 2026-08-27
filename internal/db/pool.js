'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.poolMax,
  idleTimeoutMillis: config.postgres.idleTimeoutMillis,
  connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  // Fired for idle clients that die in the background (network blip, DB restart).
  // The pool discards them on its own; we just want it in the logs.
  logger.error({ err }, 'unexpected error on idle postgres client');
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const durationMs = Date.now() - start;
  if (durationMs > 200) {
    logger.warn({ durationMs, text }, 'slow query');
  }
  return result;
}

async function getClient() {
  return pool.connect();
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, getClient, close };
