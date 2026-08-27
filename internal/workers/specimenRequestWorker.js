'use strict';

const itemsRepository = require('../domain/labOrders/itemsRepository');
const labTestsRepository = require('../domain/labTests/repository');
const specimensService = require('../domain/specimens/service');
const logger = require('../logger');

/**
 * Reacts to lab.order.validated by creating the specimen record collection
 * staff will act on. Orders are modeled with a single specimen (see
 * migrations/0009 and ARCHITECTURE.md) so when an order mixes specimen
 * types we fall back to the first test's type rather than splitting into
 * multiple specimens — a deliberate scope cut for this project, flagged
 * loudly rather than silently picked.
 */
async function handleOrderValidated(data) {
  const { labOrderId } = data;

  const items = await itemsRepository.listByOrderId(labOrderId);
  if (items.length === 0) {
    logger.warn({ labOrderId }, 'validated order has no items, skipping specimen request');
    return;
  }

  const tests = await labTestsRepository.findByIds(items.map((item) => item.lab_test_id));
  const specimenTypes = new Set(tests.map((test) => test.specimen_type));

  if (specimenTypes.size > 1) {
    logger.warn(
      { labOrderId, specimenTypes: [...specimenTypes] },
      'order spans multiple specimen types, defaulting to the first test\'s type',
    );
  }

  await specimensService.requestSpecimen({ labOrderId, specimenType: tests[0].specimen_type });
}

module.exports = { handleOrderValidated };
