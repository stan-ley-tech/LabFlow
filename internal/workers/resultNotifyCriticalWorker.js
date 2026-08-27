'use strict';

const labOrdersRepository = require('../domain/labOrders/repository');
const cliniciansRepository = require('../domain/clinicians/repository');
const auditLogs = require('../domain/auditLogs/repository');
const notifier = require('../lib/notifier');
const logger = require('../logger');

/**
 * Reacts to lab.result.critical. This is the one notification path that
 * pages instead of just emailing — critical results get both SMS and
 * email, and this queue is configured with more retries than the others
 * (see internal/events/topology.js) because losing a critical-result
 * notification is worse than losing a routine one.
 */
async function handleResultCritical(data) {
  const { labResultId, labOrderId } = data;

  const order = await labOrdersRepository.findById(labOrderId);
  if (!order) {
    logger.warn({ labOrderId }, 'order no longer exists, dropping critical notification');
    return;
  }

  const clinician = await cliniciansRepository.findById(order.clinician_id);
  if (!clinician) {
    logger.error({ labOrderId }, 'no clinician on file for a critical result, cannot notify');
    return;
  }

  const smsSent = clinician.phone
    ? await notifier.sendSms(
        clinician.phone,
        `URGENT: critical result for order ${order.order_number}. Please review immediately.`,
      )
    : null;

  await notifier.sendEmail(
    clinician.email,
    `CRITICAL result — order ${order.order_number}`,
    `A critical result has been validated for order ${order.order_number}. Immediate review is required.`,
  );

  await auditLogs.record({
    actorType: 'worker',
    action: 'notification.critical_result',
    entityType: 'lab_result',
    entityId: labResultId,
    metadata: { orderNumber: order.order_number, smsSent: Boolean(smsSent) },
  });
}

module.exports = { handleResultCritical };
