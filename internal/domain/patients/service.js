'use strict';

const { withTransaction } = require('../../db/transaction');
const repository = require('./repository');
const auditLogs = require('../auditLogs/repository');
const { ConflictError, NotFoundError } = require('../../lib/errors');
const { isUniqueViolation } = require('../../lib/pgErrors');

function toPublic(patient) {
  return {
    id: patient.id,
    mrn: patient.mrn,
    firstName: patient.first_name,
    lastName: patient.last_name,
    dateOfBirth: patient.date_of_birth,
    sex: patient.sex,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    createdAt: patient.created_at,
    updatedAt: patient.updated_at,
  };
}

async function createPatient(input, actor) {
  try {
    const patient = await withTransaction(async (client) => {
      const created = await repository.create(input, client.query.bind(client));
      await auditLogs.record(
        {
          actorType: actor.type,
          actorId: actor.id,
          action: 'patient.created',
          entityType: 'patient',
          entityId: created.id,
          metadata: { mrn: created.mrn },
        },
        client.query.bind(client),
      );
      return created;
    });
    return toPublic(patient);
  } catch (err) {
    if (isUniqueViolation(err, 'patients_mrn_unique')) {
      throw new ConflictError(`a patient with MRN ${input.mrn} already exists`);
    }
    throw err;
  }
}

async function getPatient(id) {
  const patient = await repository.findById(id);
  if (!patient) throw new NotFoundError('patient not found');
  return toPublic(patient);
}

async function listPatients(pagination) {
  const patients = await repository.list(pagination);
  return patients.map(toPublic);
}

module.exports = { createPatient, getPatient, listPatients, toPublic };
