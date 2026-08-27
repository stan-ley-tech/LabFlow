'use strict';

const db = require('../../db/pool');

async function record({ specimenId, eventType, notes, recordedBy }, executor) {
  await executor(
    `INSERT INTO specimen_events (specimen_id, event_type, notes, recorded_by)
     VALUES ($1, $2, $3, $4)`,
    [specimenId, eventType, notes || null, recordedBy || null],
  );
}

async function listBySpecimenId(specimenId, executor = db.query) {
  const { rows } = await executor(
    'SELECT * FROM specimen_events WHERE specimen_id = $1 ORDER BY occurred_at',
    [specimenId],
  );
  return rows;
}

module.exports = { record, listBySpecimenId };
