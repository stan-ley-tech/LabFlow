'use strict';

const request = require('supertest');
const createApp = require('../../internal/http/app');
const { createUser } = require('../helpers/factories');
const { issueTestToken } = require('../helpers/auth');
const { truncateAll, closeAll } = require('../helpers/db');

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

describe('POST /auth/login', () => {
  test('issues a token for correct credentials', async () => {
    const user = await createUser({ email: 'login@test.local', password: 'CorrectHorse123!' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'CorrectHorse123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('rejects an incorrect password without revealing which field was wrong', async () => {
    const user = await createUser({ email: 'wrongpass@test.local', password: 'CorrectHorse123!' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  test('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.local', password: 'whatever123' });

    expect(res.status).toBe(401);
  });

  test('rejects a malformed request body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

describe('POST /auth/users', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/auth/users').send({});
    expect(res.status).toBe(401);
  });

  test('requires the admin role', async () => {
    const clinicianUser = await createUser({ role: 'clinician' });
    const token = issueTestToken(clinicianUser);

    const res = await request(app)
      .post('/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new-user@test.local',
        password: 'SomePassword123!',
        fullName: 'New User',
        role: 'lab_technician',
      });

    expect(res.status).toBe(403);
  });

  test('an admin can provision a new account', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = issueTestToken(admin);

    const res = await request(app)
      .post('/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'provisioned@test.local',
        password: 'SomePassword123!',
        fullName: 'Provisioned User',
        role: 'lab_validator',
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('provisioned@test.local');
    expect(res.body.role).toBe('lab_validator');
  });
});
