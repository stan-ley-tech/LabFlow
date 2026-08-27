'use strict';

const db = require('../../internal/db/pool');

// Order matters: children before parents, respecting foreign keys.
const TABLES = [
  'dead_letters',
  'idempotency_keys',
  'outbox_events',
  'audit_logs',
  'integration_requests',
  'result_values',
  'lab_results',
  'specimen_events',
  'specimens',
  'lab_order_items',
  'lab_orders',
  'lab_tests',
  'laboratories',
  'users',
  'clinicians',
  'patients',
];

async function truncateAll() {
  await db.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

async function closeAll() {
  const redis = require('../../internal/redis/client');
  await db.close();
  await redis.close();
}

module.exports = { truncateAll, closeAll };
