'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, laboratory_id, lab_order_id, request_type, external_reference_id, status, attempt_count, last_attempt_at, request_payload, response_payload, error_message, created_at, updated_at';

async function create(
  { laboratoryId, labOrderId, requestType, externalReferenceId, requestPayload },
  executor = db.query,
) {
  const { rows } = await executor(
    `INSERT INTO integration_requests
       (laboratory_id, lab_order_id, request_type, external_reference_id, request_payload, attempt_count, last_attempt_at)
     VALUES ($1, $2, $3, $4, $5, 1, now())
     RETURNING ${COLUMNS}`,
    [laboratoryId, labOrderId || null, requestType, externalReferenceId || null, requestPayload || null],
  );
  return rows[0];
}

async function findByExternalReference(laboratoryId, externalReferenceId, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM integration_requests
     WHERE laboratory_id = $1 AND external_reference_id = $2 AND request_type = 'result_webhook'`,
    [laboratoryId, externalReferenceId],
  );
  return rows[0] || null;
}

async function markOutcome(id, { status, responsePayload, errorMessage }, executor = db.query) {
  const { rows } = await executor(
    `UPDATE integration_requests
     SET status = $2, response_payload = $3, error_message = $4, updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, status, responsePayload || null, errorMessage || null],
  );
  return rows[0] || null;
}

module.exports = { create, findByExternalReference, markOutcome };
