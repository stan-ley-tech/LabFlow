'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const auditLogs = require('../auditLogs/repository');
const { ConflictError, NotFoundError } = require('../../lib/errors');
const { isUniqueViolation } = require('../../lib/pgErrors');

function toPublic(clinician) {
  return {
    id: clinician.id,
    licenseNumber: clinician.license_number,
    firstName: clinician.first_name,
    lastName: clinician.last_name,
    email: clinician.email,
    phone: clinician.phone,
    department: clinician.department,
    isActive: clinician.is_active,
    createdAt: clinician.created_at,
    updatedAt: clinician.updated_at,
  };
}

async function createClinician(input, actor) {
  try {
    const clinician = await withTransaction(async (client) => {
      const created = await repository.create(input, client.query.bind(client));
      await auditLogs.record(
        {
          actorType: actor.type,
          actorId: actor.id,
          action: 'clinician.created',
          entityType: 'clinician',
          entityId: created.id,
          metadata: { licenseNumber: created.license_number },
        },
        client.query.bind(client),
      );
      return created;
    });
    return toPublic(clinician);
  } catch (err) {
    if (isUniqueViolation(err, 'clinicians_license_number_unique')) {
      throw new ConflictError(`a clinician with license number ${input.licenseNumber} already exists`);
    }
    if (isUniqueViolation(err, 'clinicians_email_unique')) {
      throw new ConflictError(`a clinician with email ${input.email} already exists`);
    }
    throw err;
  }
}

async function getClinician(id) {
  const clinician = await repository.findById(id);
  if (!clinician) throw new NotFoundError('clinician not found');
  return toPublic(clinician);
}

async function listClinicians(pagination) {
  const clinicians = await repository.list(pagination);
  return clinicians.map(toPublic);
}

module.exports = { createClinician, getClinician, listClinicians, toPublic };
