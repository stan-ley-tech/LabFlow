'use strict';

/**
 * Drives the full order lifecycle the same way a real client and a real
 * laboratory would: over HTTP, through real RabbitMQ consumers and the
 * outbox relay, against a real (if fake) external laboratory service
 * listening on a real port. This is the automated version of the manual
 * walkthrough in README.md's "Try it by hand" section.
 */

const request = require('supertest');
const createApp = require('../../internal/http/app');
const createExternalLabApp = require('../../internal/externallab/app');
const config = require('../../internal/config');
const { startConsumer } = require('../../internal/events/consumerRunner');
const { startOutboxRelay } = require('../../internal/events/outboxRelay');
const { close: closeAmqp } = require('../../internal/events/connection');
const { CONSUMER_BINDINGS } = require('../../internal/workers');
const labResultsService = require('../../internal/domain/labResults/service');
const notifier = require('../../internal/lib/notifier');
const {
  createUser,
  createPatient,
  createClinician,
  createLabTest,
  createLaboratory,
} = require('../helpers/factories');
const { truncateAll, closeAll } = require('../helpers/db');
const { waitFor } = require('../helpers/wait');
const { issueTestToken } = require('../helpers/auth');
const db = require('../../internal/db/pool');

const API_PORT = 3900;
const EXTERNAL_LAB_PORT = 4900;
const WEBHOOK_SECRET = 'e2e-test-webhook-secret';

let apiServer;
let externalLabServer;
let outboxRelay;
let consumerChannels = [];
let admin;
let token;

beforeAll(async () => {
  await truncateAll();

  config.externalLab.labflowWebhookUrl = `http://127.0.0.1:${API_PORT}/webhooks/laboratory/results`;
  config.externalLab.webhookSecret = WEBHOOK_SECRET;

  apiServer = createApp().listen(API_PORT);
  externalLabServer = createExternalLabApp().listen(EXTERNAL_LAB_PORT);

  consumerChannels = await Promise.all(
    CONSUMER_BINDINGS.map(([name, handler]) => startConsumer(name, handler)),
  );
  outboxRelay = startOutboxRelay({ intervalMs: 200 });

  admin = await createUser({ role: 'admin' });
  token = issueTestToken(admin);

  await createLaboratory({
    code: 'LABFLOW_REF',
    baseUrl: `http://127.0.0.1:${EXTERNAL_LAB_PORT}`,
    webhookSecret: WEBHOOK_SECRET,
  });
}, 30000);

afterAll(async () => {
  outboxRelay?.stop();
  await Promise.all(consumerChannels.map((ch) => ch.close().catch(() => {})));
  await new Promise((resolve) => apiServer?.close(resolve));
  await new Promise((resolve) => externalLabServer?.close(resolve));
  await closeAmqp();
  await closeAll();
}, 30000);

describe('lab order lifecycle, end to end', () => {
  test('order creation flows all the way to a validated result without manual intervention', async () => {
    const patient = await createPatient();
    const clinician = await createClinician();
    const labTest = await createLabTest({ code: 'GLU', name: 'Blood Glucose', specimenType: 'blood' });

    const createRes = await request(apiServer)
      .post('/lab-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: patient.id, clinicianId: clinician.id, labTestIds: [labTest.id] });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    // order.created -> outbox relay -> order-validation consumer -> validated
    await waitFor(async () => {
      const res = await request(apiServer).get(`/lab-orders/${orderId}`).set('Authorization', `Bearer ${token}`);
      return res.body.status === 'validated' ? res.body : null;
    }, { timeoutMs: 5000 });

    // order.validated -> specimen-request consumer -> a specimen exists
    const withSpecimen = await waitFor(async () => {
      const res = await request(apiServer).get(`/lab-orders/${orderId}`).set('Authorization', `Bearer ${token}`);
      return res.body.specimen ? res.body : null;
    }, { timeoutMs: 5000 });
    expect(withSpecimen.status).toBe('specimen_requested');

    const collectRes = await request(apiServer)
      .post(`/lab-orders/${orderId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(collectRes.status).toBe(200);

    // specimen.collected -> dispatch worker -> real HTTP call to the fake
    // lab -> ack -> specimen.received -> lab-processing-start -> the fake
    // lab's own async webhook delivers results -> lab.result.created
    const withResults = await waitFor(async () => {
      const res = await request(apiServer).get(`/lab-orders/${orderId}`).set('Authorization', `Bearer ${token}`);
      return res.body.status === 'results_received' ? res.body : null;
    }, { timeoutMs: 10000 });
    expect(withResults.items[0].status).toBe('in_progress');

    const { rows } = await db.query(
      'SELECT id FROM lab_results WHERE lab_order_item_id = $1',
      [withResults.items[0].id],
    );
    expect(rows).toHaveLength(1);

    const validatorToken = issueTestToken(await createUser({ role: 'lab_validator' }));
    const validateRes = await request(apiServer)
      .post(`/lab-results/${rows[0].id}/validate`)
      .set('Authorization', `Bearer ${validatorToken}`);
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.status).toBe('validated');

    const finalOrder = await waitFor(async () => {
      const res = await request(apiServer).get(`/lab-orders/${orderId}`).set('Authorization', `Bearer ${token}`);
      return res.body.status === 'completed' ? res.body : null;
    }, { timeoutMs: 5000 });
    expect(finalOrder.status).toBe('completed');
  }, 30000);

  test('a critical result triggers the paging notification path', async () => {
    const patient = await createPatient();
    const clinician = await createClinician({ phone: '555-0199', email: 'paged-clinician@test.local' });
    const labTest = await createLabTest();
    const laboratories = await db.query('SELECT id FROM laboratories LIMIT 1');
    const laboratoryId = laboratories.rows[0].id;

    const orderRes = await db.query(
      `INSERT INTO lab_orders (order_number, patient_id, clinician_id, status)
       VALUES ($1, $2, $3, 'in_progress') RETURNING id`,
      [`ORD-CRIT-${Date.now()}`, patient.id, clinician.id],
    );
    const itemRes = await db.query(
      `INSERT INTO lab_order_items (lab_order_id, lab_test_id, status)
       VALUES ($1, $2, 'in_progress') RETURNING id`,
      [orderRes.rows[0].id, labTest.id],
    );

    const smsSpy = jest.spyOn(notifier, 'sendSms');
    const emailSpy = jest.spyOn(notifier, 'sendEmail');

    const result = await labResultsService.createResult({
      labOrderItemId: itemRes.rows[0].id,
      laboratoryId,
      values: [
        {
          analyteName: 'Potassium',
          value: '7.8',
          unit: 'mmol/L',
          referenceRangeLow: 3.5,
          referenceRangeHigh: 5.1,
          isAbnormal: true,
          isCritical: true,
        },
      ],
    });

    const validator = await createUser({ role: 'lab_validator' });
    await labResultsService.validateResult(result.id, { validatedByUserId: validator.id });

    await waitFor(() => smsSpy.mock.calls.length > 0, { timeoutMs: 5000 });

    expect(smsSpy).toHaveBeenCalledWith('555-0199', expect.stringContaining('URGENT'));
    expect(emailSpy).toHaveBeenCalledWith(
      'paged-clinician@test.local',
      expect.stringContaining('CRITICAL'),
      expect.any(String),
    );

    smsSpy.mockRestore();
    emailSpy.mockRestore();
  }, 15000);
});
