'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const auditLogs = require('../auditLogs/repository');
const { ConflictError, NotFoundError } = require('../../lib/errors');
const { isUniqueViolation } = require('../../lib/pgErrors');

function toPublic(test) {
  return {
    id: test.id,
    code: test.code,
    name: test.name,
    specimenType: test.specimen_type,
    turnaroundHours: test.turnaround_hours,
    isActive: test.is_active,
    createdAt: test.created_at,
    updatedAt: test.updated_at,
  };
}

async function createLabTest(input, actor) {
  try {
    const test = await withTransaction(async (client) => {
      const created = await repository.create(input, client.query.bind(client));
      await auditLogs.record(
        {
          actorType: actor.type,
          actorId: actor.id,
          action: 'lab_test.created',
          entityType: 'lab_test',
          entityId: created.id,
          metadata: { code: created.code },
        },
        client.query.bind(client),
      );
      return created;
    });
    return toPublic(test);
  } catch (err) {
    if (isUniqueViolation(err, 'lab_tests_code_unique')) {
      throw new ConflictError(`a lab test with code ${input.code} already exists`);
    }
    throw err;
  }
}

async function getLabTest(id) {
  const test = await repository.findById(id);
  if (!test) throw new NotFoundError('lab test not found');
  return toPublic(test);
}

async function listLabTests(options) {
  const tests = await repository.list(options);
  return tests.map(toPublic);
}

module.exports = { createLabTest, getLabTest, listLabTests, toPublic };
