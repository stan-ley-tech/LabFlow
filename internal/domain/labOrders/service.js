'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const itemsRepository = require('./itemsRepository');
const patientsRepository = require('../patients/repository');
const cliniciansRepository = require('../clinicians/repository');
const labTestsRepository = require('../labTests/repository');
const specimensRepository = require('../specimens/repository');
const auditLogs = require('../auditLogs/repository');
const outbox = require('../../events/outbox');
const { EVENTS } = require('../../events/topology');
const { generateOrderNumber } = require('../../lib/identifiers');
const { NotFoundError, ValidationError } = require('../../lib/errors');

function toPublic(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    patientId: order.patient_id,
    clinicianId: order.clinician_id,
    status: order.status,
    priority: order.priority,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function itemToPublic(item) {
  return {
    id: item.id,
    labOrderId: item.lab_order_id,
    labTestId: item.lab_test_id,
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

async function createOrder({ patientId, clinicianId, priority, notes, labTestIds }, actor) {
  const order = await withTransaction(async (client) => {
    const query = client.query.bind(client);

    const patient = await patientsRepository.findById(patientId, query);
    if (!patient) throw new NotFoundError(`patient ${patientId} not found`);

    const clinician = await cliniciansRepository.findById(clinicianId, query);
    if (!clinician) throw new NotFoundError(`clinician ${clinicianId} not found`);

    const uniqueTestIds = [...new Set(labTestIds)];
    const tests = await labTestsRepository.findByIds(uniqueTestIds, query);
    if (tests.length !== uniqueTestIds.length) {
      const foundIds = new Set(tests.map((t) => t.id));
      const missing = uniqueTestIds.filter((id) => !foundIds.has(id));
      throw new ValidationError('one or more lab tests do not exist', { missing });
    }

    const created = await repository.create(
      { orderNumber: generateOrderNumber(), patientId, clinicianId, priority, notes },
      query,
    );
    const items = await itemsRepository.createMany(created.id, uniqueTestIds, query);

    await outbox.enqueue(client, {
      aggregateType: 'lab_order',
      aggregateId: created.id,
      eventType: EVENTS.ORDER_CREATED,
      payload: {
        labOrderId: created.id,
        orderNumber: created.order_number,
        patientId,
        clinicianId,
        priority: created.priority,
        labTestIds: uniqueTestIds,
      },
    });

    await auditLogs.record(
      {
        actorType: actor.type,
        actorId: actor.id,
        action: 'lab_order.created',
        entityType: 'lab_order',
        entityId: created.id,
        metadata: { orderNumber: created.order_number, testCount: uniqueTestIds.length },
      },
      query,
    );

    return { ...toPublic(created), items: items.map(itemToPublic) };
  });

  return order;
}

async function getOrder(id) {
  const order = await repository.findById(id);
  if (!order) throw new NotFoundError('lab order not found');

  const [items, specimen] = await Promise.all([
    itemsRepository.listByOrderId(id),
    specimensRepository.findByLabOrderId(id),
  ]);

  return {
    ...toPublic(order),
    items: items.map(itemToPublic),
    specimen: specimen ? { id: specimen.id, barcode: specimen.barcode, status: specimen.status } : null,
  };
}

async function listOrders(filters) {
  const orders = await repository.list(filters);
  return orders.map(toPublic);
}

module.exports = { createOrder, getOrder, listOrders, toPublic, itemToPublic };
