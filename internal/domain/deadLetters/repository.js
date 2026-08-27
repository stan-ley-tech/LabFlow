'use strict';

const db = require('../../db/pool');

async function create({ queueName, routingKey, payload, headers, errorMessage }, executor = db.query) {
  const { rows } = await executor(
    `INSERT INTO dead_letters (queue_name, routing_key, payload, headers, error_message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [queueName, routingKey, payload, headers, errorMessage],
  );
  return rows[0];
}

async function list({ resolved = null, limit = 50 } = {}, executor = db.query) {
  if (resolved === null) {
    const { rows } = await executor(
      'SELECT * FROM dead_letters ORDER BY failed_at DESC LIMIT $1',
      [limit],
    );
    return rows;
  }
  const { rows } = await executor(
    'SELECT * FROM dead_letters WHERE resolved = $1 ORDER BY failed_at DESC LIMIT $2',
    [resolved, limit],
  );
  return rows;
}

module.exports = { create, list };
