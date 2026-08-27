'use strict';

const db = require('../../db/pool');
const { getCorrelationId } = require('../../logger/context');

async function record(
  { actorType, actorId = null, action, entityType, entityId = null, metadata = null, correlationId },
  executor = db.query,
) {
  await executor(
    `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      correlationId || getCorrelationId() || null,
    ],
  );
}

async function list({ entityType, entityId, limit = 50 } = {}, executor = db.query) {
  if (entityType && entityId) {
    const { rows } = await executor(
      `SELECT * FROM audit_logs WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [entityType, entityId, limit],
    );
    return rows;
  }
  const { rows } = await executor('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [
    limit,
  ]);
  return rows;
}

module.exports = { record, list };
