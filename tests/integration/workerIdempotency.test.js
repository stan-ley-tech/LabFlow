'use strict';

/**
 * RabbitMQ delivers at least once: if the worker crashes after a handler
 * finishes its work but before the message is acked, the broker redelivers
 * the same event and the handler runs again. These tests simulate that by
 * invoking a handler twice with identical event data against a real
 * database and asserting the second call is a safe no-op rather than a
 * duplicate side effect.
 */

const orderValidationWorker = require('../../internal/workers/orderValidationWorker');
const specimenRequestWorker = require('../../internal/workers/specimenRequestWorker');
const specimenDispatchWorker = require('../../internal/workers/specimenDispatchWorker');
const {
  createPatient,
  createClinician,
  createLabTest,
  createLabOrder,
} = require('../helpers/factories');
const { truncateAll, closeAll } = require('../helpers/db');
const db = require('../../internal/db/pool');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

describe('orderValidationWorker.handleOrderCreated redelivered', () => {
  test('running it twice validates the order once, not twice', async () => {
    const patient = await createPatient();
    const clinician = await createClinician();
    const labTest = await createLabTest();
    const { order } = await createLabOrder(patient, clinician, labTest, { status: 'pending' });

    await orderValidationWorker.handleOrderCreated({ labOrderId: order.id });
    await orderValidationWorker.handleOrderCreated({ labOrderId: order.id }); // simulated redelivery

    const { rows } = await db.query('SELECT status FROM lab_orders WHERE id = $1', [order.id]);
    expect(rows[0].status).toBe('validated');

    const { rows: events } = await db.query(
      "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'lab.order.validated' AND aggregate_id = $1",
      [order.id],
    );
    expect(events[0].count).toBe(1);
  });
});

describe('specimenRequestWorker.handleOrderValidated redelivered', () => {
  test('running it twice creates exactly one specimen', async () => {
    const patient = await createPatient();
    const clinician = await createClinician();
    const labTest = await createLabTest();
    const { order } = await createLabOrder(patient, clinician, labTest, { status: 'validated' });

    await specimenRequestWorker.handleOrderValidated({ labOrderId: order.id });
    await specimenRequestWorker.handleOrderValidated({ labOrderId: order.id }); // simulated redelivery

    const { rows } = await db.query('SELECT count(*)::int AS count FROM specimens WHERE lab_order_id = $1', [
      order.id,
    ]);
    expect(rows[0].count).toBe(1);
  });
});

describe('specimenDispatchWorker.handleSpecimenCollected redelivered', () => {
  test('skips re-dispatching a specimen that has already moved past collected', async () => {
    const patient = await createPatient();
    const clinician = await createClinician();
    const labTest = await createLabTest();
    const { order } = await createLabOrder(patient, clinician, labTest, { status: 'in_progress' });

    const { rows } = await db.query(
      `INSERT INTO specimens (lab_order_id, barcode, specimen_type, status, received_at)
       VALUES ($1, $2, $3, 'received', now()) RETURNING *`,
      [order.id, 'SPC-ALREADY-DISPATCHED', 'blood'],
    );
    const specimen = rows[0];

    await expect(
      specimenDispatchWorker.handleSpecimenCollected({
        specimenId: specimen.id,
        labOrderId: order.id,
        barcode: specimen.barcode,
      }),
    ).resolves.toBeUndefined();

    const { rows: integrationRequests } = await db.query(
      'SELECT count(*)::int AS count FROM integration_requests WHERE lab_order_id = $1',
      [order.id],
    );
    expect(integrationRequests[0].count).toBe(0);
  });
});
