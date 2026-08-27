'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../../internal/db/pool');

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

async function createPatient(overrides = {}) {
  const suffix = uniqueSuffix();
  const { rows } = await db.query(
    `INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.mrn || `MRN-${suffix}`,
      overrides.firstName || 'Test',
      overrides.lastName || 'Patient',
      overrides.dateOfBirth || '1990-01-01',
      overrides.sex || 'unknown',
    ],
  );
  return rows[0];
}

async function createClinician(overrides = {}) {
  const suffix = uniqueSuffix();
  const { rows } = await db.query(
    `INSERT INTO clinicians (license_number, first_name, last_name, email, phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.licenseNumber || `LIC-${suffix}`,
      overrides.firstName || 'Test',
      overrides.lastName || 'Clinician',
      overrides.email || `clinician-${suffix}@test.local`,
      overrides.phone || null,
    ],
  );
  return rows[0];
}

async function createLabTest(overrides = {}) {
  const suffix = uniqueSuffix();
  const { rows } = await db.query(
    `INSERT INTO lab_tests (code, name, specimen_type, turnaround_hours)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.code || `TST-${suffix}`,
      overrides.name || 'Test Panel',
      overrides.specimenType || 'blood',
      overrides.turnaroundHours || 24,
    ],
  );
  return rows[0];
}

async function createLaboratory(overrides = {}) {
  const suffix = uniqueSuffix();
  const { rows } = await db.query(
    `INSERT INTO laboratories (code, name, adapter_type, base_url, webhook_secret)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.code || `LAB-${suffix}`,
      overrides.name || 'Test Laboratory',
      overrides.adapterType || 'fake_http',
      overrides.baseUrl || 'http://localhost:4000',
      overrides.webhookSecret || 'test-webhook-secret',
    ],
  );
  return rows[0];
}

async function createUser(overrides = {}) {
  const suffix = uniqueSuffix();
  const password = overrides.password || 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 4);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.email || `user-${suffix}@test.local`,
      passwordHash,
      overrides.fullName || 'Test User',
      overrides.role || 'admin',
    ],
  );
  return { ...rows[0], plainPassword: password };
}

async function createLabOrder(patient, clinician, labTest, overrides = {}) {
  const suffix = uniqueSuffix();
  const { rows } = await db.query(
    `INSERT INTO lab_orders (order_number, patient_id, clinician_id, status, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.orderNumber || `ORD-TEST-${suffix}`,
      patient.id,
      clinician.id,
      overrides.status || 'pending',
      overrides.priority || 'routine',
    ],
  );
  const order = rows[0];

  const { rows: itemRows } = await db.query(
    `INSERT INTO lab_order_items (lab_order_id, lab_test_id, status)
     VALUES ($1, $2, $3) RETURNING *`,
    [order.id, labTest.id, overrides.itemStatus || 'pending'],
  );

  return { order, item: itemRows[0] };
}

module.exports = {
  createPatient,
  createClinician,
  createLabTest,
  createLaboratory,
  createUser,
  createLabOrder,
};
