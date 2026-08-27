'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const auditLogs = require('../auditLogs/repository');
const { ConflictError, NotFoundError } = require('../../lib/errors');
const { isUniqueViolation } = require('../../lib/pgErrors');

function toPublic(lab) {
  return {
    id: lab.id,
    code: lab.code,
    name: lab.name,
    adapterType: lab.adapter_type,
    baseUrl: lab.base_url,
    isActive: lab.is_active,
    createdAt: lab.created_at,
    updatedAt: lab.updated_at,
  };
}

async function createLaboratory(input, actor) {
  try {
    const lab = await withTransaction(async (client) => {
      const created = await repository.create(input, client.query.bind(client));
      await auditLogs.record(
        {
          actorType: actor.type,
          actorId: actor.id,
          action: 'laboratory.created',
          entityType: 'laboratory',
          entityId: created.id,
          metadata: { code: created.code, adapterType: created.adapter_type },
        },
        client.query.bind(client),
      );
      return created;
    });
    return toPublic(lab);
  } catch (err) {
    if (isUniqueViolation(err, 'laboratories_code_unique')) {
      throw new ConflictError(`a laboratory with code ${input.code} already exists`);
    }
    throw err;
  }
}

async function getLaboratory(id) {
  const lab = await repository.findById(id);
  if (!lab) throw new NotFoundError('laboratory not found');
  return toPublic(lab);
}

async function listLaboratories(options) {
  const labs = await repository.list(options);
  return labs.map(toPublic);
}

module.exports = { createLaboratory, getLaboratory, listLaboratories, toPublic };
