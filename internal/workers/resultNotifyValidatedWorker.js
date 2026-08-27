'use strict';

const labOrdersRepository = require('../domain/labOrders/repository');
const cliniciansRepository = require('../domain/clinicians/repository');
const auditLogs = require('../domain/auditLogs/repository');
const notifier = require('../lib/notifier');
const logger = require('../logger');

/** Reacts to lab.result.validated: closes the loop with "the clinician has been notified". */
async function handleResultValidated(data) {
  const { labResultId, labOrderId } = data;

  const order = await labOrdersRepository.findById(labOrderId);
  if (!order) {
    logger.warn({ labOrderId }, 'order no longer exists, dropping validated notification');
    return;
  }

  const clinician = await cliniciansRepository.findById(order.clinician_id);
  if (!clinician) return;

  await notifier.sendEmail(
    clinician.email,
    `Result validated for order ${order.order_number}`,
    `The result for order ${order.order_number} has been validated and is ready for review.`,
  );

  await auditLogs.record({
    actorType: 'worker',
    action: 'notification.result_validated',
    entityType: 'lab_result',
    entityId: labResultId,
    metadata: { orderNumber: order.order_number },
  });
}

module.exports = { handleResultValidated };
