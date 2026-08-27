'use strict';

const { withTransaction } = require('../db/transaction');
const labOrdersRepository = require('../domain/labOrders/repository');
const outbox = require('../events/outbox');
const { EVENTS } = require('../events/topology');
const auditLogs = require('../domain/auditLogs/repository');
const logger = require('../logger');

/**
 * Reacts to lab.order.created. Referential integrity (patient, clinician,
 * tests exist) is already enforced at creation time inside the same
 * transaction — this is the seam where slower, non-transactional business
 * rules would run (insurance eligibility, duplicate-order checks against
 * another system, ...). None of those exist here, so this worker's job is
 * mostly to make the validation step a real, observable stage in the
 * pipeline rather than something implicit in order creation.
 */
async function handleOrderCreated(data) {
  const { labOrderId } = data;

  await withTransaction(async (client) => {
    const query = client.query.bind(client);
    const order = await labOrdersRepository.findByIdForUpdate(labOrderId, query);

    if (!order) {
      logger.warn({ labOrderId }, 'order no longer exists, dropping event');
      return;
    }
    if (order.status !== 'pending') {
      logger.info({ labOrderId, status: order.status }, 'order already past validation, skipping');
      return;
    }

    await labOrdersRepository.updateStatus(labOrderId, 'validated', query);

    await outbox.enqueue(client, {
      aggregateType: 'lab_order',
      aggregateId: labOrderId,
      eventType: EVENTS.ORDER_VALIDATED,
      payload: { labOrderId, patientId: order.patient_id, clinicianId: order.clinician_id },
    });

    await auditLogs.record(
      {
        actorType: 'worker',
        action: 'lab_order.validated',
        entityType: 'lab_order',
        entityId: labOrderId,
      },
      query,
    );
  });
}

module.exports = { handleOrderCreated };
