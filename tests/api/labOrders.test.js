'use strict';

const request = require('supertest');
const createApp = require('../../internal/http/app');
const {
  createUser,
  createPatient,
  createClinician,
  createLabTest,
} = require('../helpers/factories');
const { issueTestToken } = require('../helpers/auth');
const { truncateAll, closeAll } = require('../helpers/db');
const db = require('../../internal/db/pool');

const app = createApp();

let admin;
let token;
let patient;
let clinician;
let labTest;

beforeEach(async () => {
  await truncateAll();
  admin = await createUser({ role: 'admin' });
  token = issueTestToken(admin);
  patient = await createPatient();
  clinician = await createClinician();
  labTest = await createLabTest();
});

afterAll(async () => {
  await closeAll();
});

function orderBody(overrides = {}) {
  return {
    patientId: patient.id,
    clinicianId: clinician.id,
    labTestIds: [labTest.id],
    ...overrides,
  };
}

describe('POST /lab-orders', () => {
  test('creates an order with its line items and an outbox event', async () => {
    const res = await request(app)
      .post('/lab-orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderBody());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].labTestId).toBe(labTest.id);

    const { rows } = await db.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', [
      res.body.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('lab.order.created');
  });

  test('rejects an order referencing a lab test that does not exist', async () => {
    const res = await request(app)
      .post('/lab-orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderBody({ labTestIds: ['00000000-0000-0000-0000-000000000000'] }));

    expect(res.status).toBe(422);
  });

  test('rejects an order for an unknown patient', async () => {
    const res = await request(app)
      .post('/lab-orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderBody({ patientId: '00000000-0000-0000-0000-000000000000' }));

    expect(res.status).toBe(404);
  });

  describe('idempotency', () => {
    test('replays the original response for a repeated Idempotency-Key with the same body', async () => {
      const body = orderBody();

      const first = await request(app)
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-1')
        .send(body);

      const second = await request(app)
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-1')
        .send(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);

      const { rows } = await db.query('SELECT count(*)::int AS count FROM lab_orders');
      expect(rows[0].count).toBe(1);
    });

    test('rejects reuse of the same key with a different request body', async () => {
      const otherTest = await createLabTest();

      await request(app)
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-2')
        .send(orderBody());

      const res = await request(app)
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-2')
        .send(orderBody({ labTestIds: [otherTest.id] }));

      expect(res.status).toBe(409);
    });

    test('two concurrent requests with the same key create only one order', async () => {
      const body = orderBody();

      const [first, second] = await Promise.all([
        request(app)
          .post('/lab-orders')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', 'test-key-concurrent')
          .send(body),
        request(app)
          .post('/lab-orders')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', 'test-key-concurrent')
          .send(body),
      ]);

      const statuses = [first.status, second.status].sort();
      // One request wins and creates the order (201); the other observes it
      // still in flight and is told to retry (409) rather than racing it.
      expect(statuses).toEqual([201, 409]);

      const { rows } = await db.query('SELECT count(*)::int AS count FROM lab_orders');
      expect(rows[0].count).toBe(1);
    });

    test('without a key, repeating the same request creates two separate orders', async () => {
      const body = orderBody();

      const first = await request(app).post('/lab-orders').set('Authorization', `Bearer ${token}`).send(body);
      const second = await request(app).post('/lab-orders').set('Authorization', `Bearer ${token}`).send(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).not.toBe(first.body.id);
    });
  });
});

describe('POST /lab-orders/:id/collect', () => {
  test('returns 404 when no specimen has been requested yet', async () => {
    const created = await request(app)
      .post('/lab-orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderBody());

    const res = await request(app)
      .post(`/lab-orders/${created.body.id}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});
