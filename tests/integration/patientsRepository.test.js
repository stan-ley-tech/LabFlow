'use strict';

const repository = require('../../internal/domain/patients/repository');
const { truncateAll, closeAll } = require('../helpers/db');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeAll();
});

describe('patients repository', () => {
  test('create then findById round-trips the row', async () => {
    const created = await repository.create({
      mrn: 'MRN-001',
      firstName: 'Grace',
      lastName: 'Hopper',
      dateOfBirth: '1906-12-09',
      sex: 'female',
      phone: '555-0100',
      email: 'grace@example.com',
    });

    expect(created.id).toBeDefined();
    expect(created.mrn).toBe('MRN-001');

    const fetched = await repository.findById(created.id);
    expect(fetched).toMatchObject({ mrn: 'MRN-001', first_name: 'Grace', last_name: 'Hopper' });
  });

  test('findById returns null for an unknown id', async () => {
    const fetched = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(fetched).toBeNull();
  });

  test('rejects a second patient with the same MRN', async () => {
    await repository.create({
      mrn: 'MRN-DUP',
      firstName: 'A',
      lastName: 'One',
      dateOfBirth: '1990-01-01',
      sex: 'unknown',
    });

    await expect(
      repository.create({
        mrn: 'MRN-DUP',
        firstName: 'B',
        lastName: 'Two',
        dateOfBirth: '1991-01-01',
        sex: 'unknown',
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('list returns patients ordered by most recently created first', async () => {
    const first = await repository.create({
      mrn: 'MRN-A',
      firstName: 'A',
      lastName: 'First',
      dateOfBirth: '1990-01-01',
      sex: 'unknown',
    });
    const second = await repository.create({
      mrn: 'MRN-B',
      firstName: 'B',
      lastName: 'Second',
      dateOfBirth: '1990-01-01',
      sex: 'unknown',
    });

    const results = await repository.list({ limit: 10, offset: 0 });
    expect(results.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});
