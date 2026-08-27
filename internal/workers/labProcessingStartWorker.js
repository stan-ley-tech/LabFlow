'use strict';

const { withTransaction } = require('../db/transaction');
const itemsRepository = require('../domain/labOrders/itemsRepository');
const outbox = require('../events/outbox');
const { EVENTS } = require('../events/topology');
const logger = require('../logger');

/** Reacts to specimen.received: the laboratory has the specimen, testing begins. */
async function handleSpecimenReceived(data) {
  const { specimenId, labOrderId } = data;

  await withTransaction(async (client) => {
    const query = client.query.bind(client);
    const items = await itemsRepository.listByOrderId(labOrderId, query);

    if (items.length === 0) {
      logger.warn({ labOrderId }, 'no items found for order, skipping processing start');
      return;
    }

    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      await itemsRepository.updateStatus(item.id, 'in_progress', query);
    }

    await query("UPDATE lab_orders SET status = 'in_progress', updated_at = now() WHERE id = $1", [
      labOrderId,
    ]);

    await outbox.enqueue(client, {
      aggregateType: 'lab_order',
      aggregateId: labOrderId,
      eventType: EVENTS.TEST_STARTED,
      payload: { labOrderId, specimenId, itemIds: items.map((item) => item.id) },
    });
  });
}

module.exports = { handleSpecimenReceived };
