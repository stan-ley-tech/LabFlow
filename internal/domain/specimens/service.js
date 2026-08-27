'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const eventsRepository = require('./eventsRepository');
const labOrdersRepository = require('../labOrders/repository');
const auditLogs = require('../auditLogs/repository');
const outbox = require('../../events/outbox');
const { EVENTS } = require('../../events/topology');
const { generateSpecimenBarcode } = require('../../lib/identifiers');
const { NotFoundError, ConflictError } = require('../../lib/errors');

function toPublic(specimen) {
  return {
    id: specimen.id,
    labOrderId: specimen.lab_order_id,
    barcode: specimen.barcode,
    specimenType: specimen.specimen_type,
    status: specimen.status,
    collectedBy: specimen.collected_by,
    collectedAt: specimen.collected_at,
    receivedAt: specimen.received_at,
    rejectionReason: specimen.rejection_reason,
    createdAt: specimen.created_at,
    updatedAt: specimen.updated_at,
  };
}

/** Called by the specimen-request consumer once an order has been validated. */
async function requestSpecimen({ labOrderId, specimenType }) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const specimen = await repository.create(
      { labOrderId, barcode: generateSpecimenBarcode(), specimenType },
      query,
    );
    await eventsRepository.record({ specimenId: specimen.id, eventType: 'requested' }, query);
    await labOrdersRepository.updateStatus(labOrderId, 'specimen_requested', query);

    await outbox.enqueue(client, {
      aggregateType: 'specimen',
      aggregateId: specimen.id,
      eventType: EVENTS.SPECIMEN_REQUESTED,
      payload: { specimenId: specimen.id, labOrderId, specimenType, barcode: specimen.barcode },
    });

    await auditLogs.record(
      {
        actorType: 'worker',
        action: 'specimen.requested',
        entityType: 'specimen',
        entityId: specimen.id,
        metadata: { labOrderId },
      },
      query,
    );

    return toPublic(specimen);
  });
}

/** Called from POST /lab-orders/:id/collect. */
async function collectSpecimen(labOrderId, { collectedByUserId, notes }) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const specimen = await repository.findByLabOrderIdForUpdate(labOrderId, query);

    if (!specimen) {
      throw new NotFoundError('no specimen has been requested for this order yet');
    }
    if (specimen.status !== 'requested') {
      throw new ConflictError(`specimen is in status '${specimen.status}', expected 'requested'`);
    }

    const updated = await repository.updateStatus(
      specimen.id,
      'collected',
      { collectedBy: collectedByUserId, collectedAt: new Date() },
      query,
    );
    await eventsRepository.record(
      { specimenId: specimen.id, eventType: 'collected', notes, recordedBy: collectedByUserId },
      query,
    );
    await labOrdersRepository.updateStatus(labOrderId, 'specimen_collected', query);

    await outbox.enqueue(client, {
      aggregateType: 'specimen',
      aggregateId: specimen.id,
      eventType: EVENTS.SPECIMEN_COLLECTED,
      payload: { specimenId: specimen.id, labOrderId, barcode: specimen.barcode },
    });

    await auditLogs.record(
      {
        actorType: 'user',
        actorId: collectedByUserId,
        action: 'specimen.collected',
        entityType: 'specimen',
        entityId: specimen.id,
        metadata: { labOrderId },
      },
      query,
    );

    return toPublic(updated);
  });
}

/** Called by the specimen-dispatch consumer right before it calls the external lab adapter. */
async function markInTransit(specimenId) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const updated = await repository.updateStatus(specimenId, 'in_transit', {}, query);
    await eventsRepository.record({ specimenId, eventType: 'in_transit' }, query);
    return toPublic(updated);
  });
}

/** Called once the external laboratory has acknowledged receipt of the specimen. */
async function markReceived(specimenId, labOrderId) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const updated = await repository.updateStatus(
      specimenId,
      'received',
      { receivedAt: new Date() },
      query,
    );
    await eventsRepository.record({ specimenId, eventType: 'received' }, query);

    await outbox.enqueue(client, {
      aggregateType: 'specimen',
      aggregateId: specimenId,
      eventType: EVENTS.SPECIMEN_RECEIVED,
      payload: { specimenId, labOrderId },
    });

    return toPublic(updated);
  });
}

async function markRejected(specimenId, reason) {
  return withTransaction(async (client) => {
    const query = client.query.bind(client);
    const updated = await repository.updateStatus(
      specimenId,
      'rejected',
      { rejectionReason: reason },
      query,
    );
    await eventsRepository.record({ specimenId, eventType: 'rejected', notes: reason }, query);
    return toPublic(updated);
  });
}

async function getSpecimen(id) {
  const specimen = await repository.findById(id);
  if (!specimen) throw new NotFoundError('specimen not found');
  const events = await eventsRepository.listBySpecimenId(id);
  return { ...toPublic(specimen), events };
}

module.exports = {
  requestSpecimen,
  collectSpecimen,
  markInTransit,
  markReceived,
  markRejected,
  getSpecimen,
  toPublic,
};
