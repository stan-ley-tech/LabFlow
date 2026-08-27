'use strict';

const request = require('supertest');
const createApp = require('../../internal/http/app');
const { createUser, createPatient } = require('../helpers/factories');
const { issueTestToken } = require('../helpers/auth');
const { truncateAll, closeAll } = require('../helpers/db');

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

describe('POST /patients', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/patients').send({});
    expect(res.status).toBe(401);
  });

  test('rejects a role with no reason to create patients', async () => {
    const labTech = await createUser({ role: 'lab_technician' });
    const token = issueTestToken(labTech);

    const res = await request(app)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ mrn: 'MRN-X', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' });

    expect(res.status).toBe(403);
  });

  test('creates a patient with valid input', async () => {
    const clinician = await createUser({ role: 'clinician' });
    const token = issueTestToken(clinician);

    const res = await request(app)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mrn: 'MRN-API-1',
        firstName: 'Katherine',
        lastName: 'Johnson',
        dateOfBirth: '1918-08-26',
        sex: 'female',
      });

    expect(res.status).toBe(201);
    expect(res.body.mrn).toBe('MRN-API-1');
    expect(res.body.id).toEqual(expect.any(String));
  });

  test('rejects an invalid date of birth format', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = issueTestToken(admin);

    const res = await request(app)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ mrn: 'MRN-BAD', firstName: 'A', lastName: 'B', dateOfBirth: '08/26/1918' });

    expect(res.status).toBe(422);
  });

  test('returns 409 for a duplicate MRN', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = issueTestToken(admin);
    await createPatient({ mrn: 'MRN-DUP-API' });

    const res = await request(app)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ mrn: 'MRN-DUP-API', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' });

    expect(res.status).toBe(409);
  });
});

describe('GET /patients/:id', () => {
  test('returns 404 for an unknown patient', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = issueTestToken(admin);

    const res = await request(app)
      .get('/patients/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('returns the patient when it exists', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = issueTestToken(admin);
    const patient = await createPatient({ mrn: 'MRN-GET-1' });

    const res = await request(app)
      .get(`/patients/${patient.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.mrn).toBe('MRN-GET-1');
  });
});
