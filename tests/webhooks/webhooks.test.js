'use strict';

const request = require('supertest');
const { randomUUID } = require('node:crypto');
const createApp = require('../../internal/http/app');
const { sign } = require('../../internal/lib/webhookSignature');
const {
  createLaboratory,
  createPatient,
  createClinician,
  createLabTest,
  createLabOrder,
} = require('../helpers/factories');
const { truncateAll, closeAll } = require('../helpers/db');
const db = require('../../internal/db/pool');

const app = createApp();
const SECRET = 'webhook-test-secret';

let laboratory;
let order;
let item;

beforeEach(async () => {
  await truncateAll();
  laboratory = await createLaboratory({ webhookSecret: SECRET });
  const patient = await createPatient();
  const clinician = await createClinician();
  const labTest = await createLabTest();
  ({ order, item } = await createLabOrder(patient, clinician, labTest, { status: 'in_progress', itemStatus: 'in_progress' }));
});

afterAll(async () => {
  await closeAll();
});

function buildPayload(overrides = {}) {
  return {
    webhookId: randomUUID(),
    laboratoryCode: laboratory.code,
    laboratoryOrderId: 'EXT-TEST-1',
    labOrderId: order.id,
    results: [
      {
        labOrderItemId: item.id,
        testCode: 'GLU',
        status: 'completed',
        values: [
          {
            analyteName: 'Glucose',
            value: '95',
            unit: 'mg/dL',
            referenceRangeLow: 70,
            referenceRangeHigh: 100,
            isAbnormal: false,
            isCritical: false,
          },
        ],
      },
    ],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function post(payload, { signature } = {}) {
  // A raw string body (not a Buffer) so superagent writes it verbatim
  // instead of re-serializing it — the signature must cover the exact
  // bytes the server's express.raw() middleware receives.
  const rawBodyString = JSON.stringify(payload);
  const sig = signature !== undefined ? signature : sign(Buffer.from(rawBodyString), SECRET);
  const req = request(app).post('/webhooks/laboratory/results').set('Content-Type', 'application/json');
  if (sig) req.set('x-labflow-signature', sig);
  return req.send(rawBodyString);
}

describe('POST /webhooks/laboratory/results', () => {
  test('processes a validly signed, well-formed payload', async () => {
    const res = await post(buildPayload());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');

    const { rows } = await db.query('SELECT * FROM lab_results WHERE lab_order_item_id = $1', [item.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending_validation');
  });

  test('rejects a payload with an invalid signature', async () => {
    const res = await post(buildPayload(), { signature: 'sha256=' + '0'.repeat(64) });
    expect(res.status).toBe(401);

    const { rows } = await db.query('SELECT * FROM lab_results WHERE lab_order_item_id = $1', [item.id]);
    expect(rows).toHaveLength(0);
  });

  test('rejects a request with no signature header at all', async () => {
    const res = await post(buildPayload(), { signature: null });
    expect(res.status).toBe(401);
  });

  test('rejects a payload for an unregistered laboratory code', async () => {
    const res = await post(buildPayload({ laboratoryCode: 'DOES-NOT-EXIST' }));
    expect(res.status).toBe(404);
  });

  test('rejects malformed JSON', async () => {
    const rawBodyString = '{not valid json';
    const res = await request(app)
      .post('/webhooks/laboratory/results')
      .set('Content-Type', 'application/json')
      .set('x-labflow-signature', sign(Buffer.from(rawBodyString), SECRET))
      .send(rawBodyString);

    expect(res.status).toBe(422);
  });

  test('rejects a payload missing required fields', async () => {
    const res = await post({ webhookId: randomUUID() });
    expect(res.status).toBe(422);
  });

  test('a failed test result marks the order item failed instead of creating a lab result', async () => {
    const payload = buildPayload({
      results: [{ labOrderItemId: item.id, testCode: 'GLU', status: 'failed', reason: 'specimen hemolyzed', values: [] }],
    });

    const res = await post(payload);
    expect(res.status).toBe(200);

    const { rows: results } = await db.query('SELECT * FROM lab_results WHERE lab_order_item_id = $1', [item.id]);
    expect(results).toHaveLength(0);

    const { rows: items } = await db.query('SELECT status FROM lab_order_items WHERE id = $1', [item.id]);
    expect(items[0].status).toBe('failed');
  });

  describe('duplicate delivery', () => {
    test('redelivering the same webhookId is a no-op the second time', async () => {
      const payload = buildPayload();

      const first = await post(payload);
      const second = await post(payload);

      expect(first.status).toBe(200);
      expect(first.body.status).toBe('processed');
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('already_processed');

      const { rows } = await db.query('SELECT * FROM lab_results WHERE lab_order_item_id = $1', [item.id]);
      expect(rows).toHaveLength(1);
    });

    test('five redeliveries of the same webhook still leave exactly one result', async () => {
      const payload = buildPayload();

      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await post(payload);
      }

      const { rows } = await db.query('SELECT * FROM lab_results WHERE lab_order_item_id = $1', [item.id]);
      expect(rows).toHaveLength(1);
    });
  });
});
