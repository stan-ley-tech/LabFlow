'use strict';

const labOrdersRepository = require('../domain/labOrders/repository');
const cliniciansRepository = require('../domain/clinicians/repository');
const auditLogs = require('../domain/auditLogs/repository');
const notifier = require('../lib/notifier');

/** Reacts to lab.result.failed: a test the laboratory could not complete. */
async function handleResultFailed(data) {
  const { labOrderId, labOrderItemId, reason } = data;

  const order = await labOrdersRepository.findById(labOrderId);
  if (!order) return;

  const clinician = await cliniciansRepository.findById(order.clinician_id);
  if (clinician) {
    await notifier.sendEmail(
      clinician.email,
      `Test failed — order ${order.order_number}`,
      `A test on order ${order.order_number} could not be completed: ${reason || 'unknown error'}. Specimen re-collection may be required.`,
    );
  }

  await auditLogs.record({
    actorType: 'worker',
    action: 'lab_result.failure_recovery',
    entityType: 'lab_order_item',
    entityId: labOrderItemId,
    metadata: { labOrderId, reason },
  });
}

module.exports = { handleResultFailed };
