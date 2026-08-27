'use strict';

const labOrdersRepository = require('../domain/labOrders/repository');
const itemsRepository = require('../domain/labOrders/itemsRepository');
const labTestsRepository = require('../domain/labTests/repository');
const specimensRepository = require('../domain/specimens/repository');
const specimensService = require('../domain/specimens/service');
const laboratoriesRepository = require('../domain/laboratories/repository');
const integrationRequestsRepository = require('../domain/integrationRequests/repository');
const { getAdapter } = require('../adapters/laboratory');
const logger = require('../logger');

/**
 * Reacts to specimen.collected: picks the (single, for this demo) active
 * laboratory, hands the order off to its adapter, and records the round
 * trip in integration_requests either way. A thrown error here is caught
 * by consumerRunner, which retries with backoff and eventually dead-letters
 * the message — this handler does not retry the adapter call itself beyond
 * what the adapter's own circuit breaker already does.
 */
async function handleSpecimenCollected(data) {
  const { specimenId, labOrderId, barcode } = data;

  const [order, items, specimen, laboratories] = await Promise.all([
    labOrdersRepository.findById(labOrderId),
    itemsRepository.listByOrderId(labOrderId),
    specimensRepository.findById(specimenId),
    laboratoriesRepository.list({ activeOnly: true }),
  ]);

  if (!order || !specimen) {
    logger.warn({ labOrderId, specimenId }, 'order or specimen no longer exists, dropping event');
    return;
  }
  if (laboratories.length === 0) {
    throw new Error('no active laboratory is registered to receive orders');
  }

  const laboratory = laboratories[0];
  const tests = await labTestsRepository.findByIds(items.map((i) => i.lab_test_id));

  const payload = {
    labOrderId: order.id,
    orderNumber: order.order_number,
    specimenBarcode: barcode || specimen.barcode,
    priority: order.priority,
    tests: tests.map((t) => ({ labOrderItemId: items.find((i) => i.lab_test_id === t.id).id, code: t.code, name: t.name })),
  };

  await specimensService.markInTransit(specimenId);

  const integrationRequest = await integrationRequestsRepository.create({
    laboratoryId: laboratory.id,
    labOrderId: order.id,
    requestType: 'send_order',
    requestPayload: payload,
  });

  const adapter = getAdapter(laboratory);

  try {
    const ack = await adapter.sendOrder(payload);
    await integrationRequestsRepository.markOutcome(integrationRequest.id, {
      status: 'acknowledged',
      responsePayload: ack,
    });
    await specimensService.markReceived(specimenId, labOrderId);
    logger.info({ labOrderId, laboratory: laboratory.code }, 'order acknowledged by laboratory');
  } catch (err) {
    await integrationRequestsRepository.markOutcome(integrationRequest.id, {
      status: 'failed',
      errorMessage: err.message,
    });
    throw err;
  }
}

module.exports = { handleSpecimenCollected };
