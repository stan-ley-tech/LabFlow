'use strict';

const itemsRepository = require('../domain/labOrders/itemsRepository');
const labOrdersRepository = require('../domain/labOrders/repository');
const cliniciansRepository = require('../domain/clinicians/repository');
const auditLogs = require('../domain/auditLogs/repository');
const notifier = require('../lib/notifier');

/** Reacts to lab.result.created: lets the ordering clinician know a result has landed, still unvalidated. */
async function handleResultCreated(data) {
  const { labOrderItemId } = data;

  const item = await itemsRepository.findById(labOrderItemId);
  if (!item) return;

  const order = await labOrdersRepository.findById(item.lab_order_id);
  if (!order) return;

  const clinician = await cliniciansRepository.findById(order.clinician_id);
  if (!clinician) return;

  await notifier.sendEmail(
    clinician.email,
    `Result available for order ${order.order_number}`,
    `A new result is available for order ${order.order_number} and is pending validation.`,
  );

  await auditLogs.record({
    actorType: 'worker',
    action: 'notification.result_available',
    entityType: 'lab_order',
    entityId: order.id,
  });
}

module.exports = { handleResultCreated };
