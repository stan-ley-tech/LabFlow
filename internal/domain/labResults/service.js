'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const valuesRepository = require('./valuesRepository');
const itemsRepository = require('../labOrders/itemsRepository');
const { recomputeOrderStatus } = require('../labOrders/statusEngine');
const auditLogs = require('../auditLogs/repository');
const outbox = require('../../events/outbox');
const { EVENTS } = require('../../events/topology');
const { NotFoundError, ConflictError } = require('../../lib/errors');

function toPublic(result, values = []) {
  return {
    id: result.id,
    labOrderItemId: result.lab_order_item_id,
    laboratoryId: result.laboratory_id,
    status: result.status,
    isCritical: result.is_critical,
    performedAt: result.performed_at,
    validatedAt: result.validated_at,
    validatedBy: result.validated_by,
    createdAt: result.created_at,
    values: values.map((v) => ({
      id: v.id,
      analyteName: v.analyte_name,
      value: v.value,
      unit: v.unit,
      referenceRangeLow: v.reference_range_low,
      referenceRangeHigh: v.reference_range_high,
      isAbnormal: v.is_abnormal,
      isCritical: v.is_critical,
    })),
  };
}

/** Called by the laboratory results webhook once a payload has been validated. */
async function createResult({ labOrderItemId, laboratoryId, values }) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);

    const item = await itemsRepository.findById(labOrderItemId, query);
    if (!item) throw new NotFoundError(`lab order item ${labOrderItemId} not found`);

    const isCritical = values.some((v) => v.isCritical);

    const result = await repository.create({ labOrderItemId, laboratoryId, isCritical }, query);
    const storedValues = await valuesRepository.createMany(result.id, values, query);

    await query(
      "UPDATE lab_orders SET status = 'results_received', updated_at = now() WHERE id = $1 AND status = 'in_progress'",
      [item.lab_order_id],
    );

    await outbox.enqueue(client, {
      aggregateType: 'lab_result',
      aggregateId: result.id,
      eventType: EVENTS.RESULT_CREATED,
      payload: { labResultId: result.id, labOrderItemId, laboratoryId, isCritical },
    });

    await auditLogs.record(
      {
        actorType: 'system',
        action: 'lab_result.created',
        entityType: 'lab_result',
        entityId: result.id,
        metadata: { labOrderItemId, isCritical },
      },
      query,
    );

    return toPublic(result, storedValues);
  });
}

async function validateResult(labResultId, { validatedByUserId }) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);

    const result = await repository.findByIdForUpdate(labResultId, query);
    if (!result) throw new NotFoundError('lab result not found');
    if (result.status !== 'pending_validation') {
      throw new ConflictError(`result is in status '${result.status}', expected 'pending_validation'`);
    }

    const validated = await repository.markValidated(labResultId, { validatedBy: validatedByUserId }, query);
    const item = await itemsRepository.updateStatus(result.lab_order_item_id, 'completed', query);
    await recomputeOrderStatus(item.lab_order_id, client);

    await outbox.enqueue(client, {
      aggregateType: 'lab_result',
      aggregateId: labResultId,
      eventType: EVENTS.RESULT_VALIDATED,
      payload: { labResultId, labOrderItemId: item.id, labOrderId: item.lab_order_id, isCritical: result.is_critical },
    });

    if (result.is_critical) {
      await outbox.enqueue(client, {
        aggregateType: 'lab_result',
        aggregateId: labResultId,
        eventType: EVENTS.RESULT_CRITICAL,
        payload: { labResultId, labOrderItemId: item.id, labOrderId: item.lab_order_id },
      });
    }

    await auditLogs.record(
      {
        actorType: 'user',
        actorId: validatedByUserId,
        action: 'lab_result.validated',
        entityType: 'lab_result',
        entityId: labResultId,
        metadata: { isCritical: result.is_critical },
      },
      query,
    );

    const values = await valuesRepository.listByResultId(labResultId, query);
    return toPublic(validated, values);
  });
}

/** Called when the external laboratory reports a test it could not complete. */
async function markResultFailed(labOrderItemId, reason) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const item = await itemsRepository.updateStatus(labOrderItemId, 'failed', query);
    if (!item) throw new NotFoundError(`lab order item ${labOrderItemId} not found`);

    await recomputeOrderStatus(item.lab_order_id, client);

    await outbox.enqueue(client, {
      aggregateType: 'lab_order_item',
      aggregateId: labOrderItemId,
      eventType: EVENTS.RESULT_FAILED,
      payload: { labOrderItemId, labOrderId: item.lab_order_id, reason },
    });

    await auditLogs.record(
      {
        actorType: 'system',
        action: 'lab_result.failed',
        entityType: 'lab_order_item',
        entityId: labOrderItemId,
        metadata: { reason },
      },
      query,
    );

    return item;
  });
}

async function getResult(id) {
  const result = await repository.findById(id);
  if (!result) throw new NotFoundError('lab result not found');
  const values = await valuesRepository.listByResultId(id);
  return toPublic(result, values);
}

async function getPatientResults(patientId) {
  const rows = await repository.findByPatientId(patientId);
  const results = await Promise.all(
    rows.map(async (row) => {
      const values = await valuesRepository.listByResultId(row.id);
      return { ...toPublic(row, values), testName: row.test_name, testCode: row.test_code };
    }),
  );
  return results;
}

module.exports = {
  createResult,
  validateResult,
  markResultFailed,
  getResult,
  getPatientResults,
  toPublic,
};
