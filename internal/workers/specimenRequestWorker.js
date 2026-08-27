'use strict';

const itemsRepository = require('../domain/labOrders/itemsRepository');
const labTestsRepository = require('../domain/labTests/repository');
const specimensRepository = require('../domain/specimens/repository');
const specimensService = require('../domain/specimens/service');
const logger = require('../logger');

/**
 * Reacts to lab.order.validated by creating the specimen record collection
 * staff will act on. Orders are modeled with a single specimen (see
 * migrations/0009 and ARCHITECTURE.md) so when an order mixes specimen
 * types we fall back to the first test's type rather than splitting into
 * multiple specimens — a deliberate scope cut for this project, flagged
 * loudly rather than silently picked.
 *
 * RabbitMQ is at-least-once delivery: if the worker crashes after this
 * handler finishes but before the message is acked, the same event is
 * redelivered and this function runs again. Without the check below that
 * would create a second specimen for the order; bailing out when one
 * already exists makes the handler safe to run twice.
 */
async function handleOrderValidated(data) {
  const { labOrderId } = data;

  const existingSpecimen = await specimensRepository.findByLabOrderId(labOrderId);
  if (existingSpecimen) {
    logger.info({ labOrderId }, 'specimen already requested for this order, skipping');
    return;
  }

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
