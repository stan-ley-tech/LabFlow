'use strict';

const bcrypt = require('bcryptjs');
const db = require('./pool');
const config = require('../config');
const logger = require('../logger');

const LAB_TESTS = [
  { code: 'CBC', name: 'Complete Blood Count', specimenType: 'blood', turnaroundHours: 4 },
  { code: 'BMP', name: 'Basic Metabolic Panel', specimenType: 'blood', turnaroundHours: 4 },
  { code: 'GLU', name: 'Blood Glucose', specimenType: 'blood', turnaroundHours: 2 },
  { code: 'LIPID', name: 'Lipid Panel', specimenType: 'blood', turnaroundHours: 6 },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', specimenType: 'blood', turnaroundHours: 24 },
  { code: 'UA', name: 'Urinalysis', specimenType: 'urine', turnaroundHours: 2 },
];

async function upsertUser({ email, password, fullName, role }) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, passwordHash, fullName, role],
  );
  return rows[0].id;
}

async function upsertLaboratory() {
  const existing = await db.query('SELECT id FROM laboratories WHERE code = $1', ['LABFLOW_REF']);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows } = await db.query(
    `INSERT INTO laboratories (code, name, adapter_type, base_url, webhook_secret)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['LABFLOW_REF', 'LabFlow Reference Laboratory (simulated)', 'fake_http', config.externalLab.baseUrl, config.externalLab.webhookSecret],
  );
  return rows[0].id;
}

async function upsertLabTests() {
  for (const test of LAB_TESTS) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await db.query('SELECT id FROM lab_tests WHERE code = $1', [test.code]);
    if (existing.rows.length > 0) continue;

    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO lab_tests (code, name, specimen_type, turnaround_hours) VALUES ($1, $2, $3, $4)`,
      [test.code, test.name, test.specimenType, test.turnaroundHours],
    );
  }
}

async function upsertClinician() {
  const existing = await db.query('SELECT id FROM clinicians WHERE license_number = $1', ['DEV-0001']);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows } = await db.query(
    `INSERT INTO clinicians (license_number, first_name, last_name, email, department)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['DEV-0001', 'Ada', 'Okafor', 'ada.okafor@labflow.local', 'Internal Medicine'],
  );
  return rows[0].id;
}

async function upsertPatient() {
  const existing = await db.query('SELECT id FROM patients WHERE mrn = $1', ['MRN-000001']);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows } = await db.query(
    `INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['MRN-000001', 'Jordan', 'Diaz', '1988-04-12', 'other'],
  );
  return rows[0].id;
}

/**
 * Seeds the minimum data needed to exercise the system by hand: one user
 * per role (all with the same dev-only password), the reference laboratory
 * pointed at the fake external lab, a small test catalog, and one demo
 * clinician/patient. Not for anything but local development.
 */
async function seed() {
  const devPassword = 'DevPassword123!';

  await upsertUser({
    email: 'admin@labflow.local',
    password: devPassword,
    fullName: 'System Administrator',
    role: 'admin',
  });
  await upsertUser({
    email: 'clinician@labflow.local',
    password: devPassword,
    fullName: 'Dr. Ada Okafor',
    role: 'clinician',
  });
  await upsertUser({
    email: 'collector@labflow.local',
    password: devPassword,
    fullName: 'Sam Rivera',
    role: 'specimen_collector',
  });
  await upsertUser({
    email: 'labtech@labflow.local',
    password: devPassword,
    fullName: 'Priya Nair',
    role: 'lab_technician',
  });
  await upsertUser({
    email: 'validator@labflow.local',
    password: devPassword,
    fullName: 'Dr. Marcus Lee',
    role: 'lab_validator',
  });

  await upsertLaboratory();
  await upsertLabTests();
  await upsertClinician();
  await upsertPatient();

  logger.info({ adminEmail: 'admin@labflow.local', devPassword }, 'seed complete');
}

if (require.main === module) {
  seed()
    .then(() => db.close())
    .catch((err) => {
      logger.error({ err }, 'seed failed');
      process.exitCode = 1;
      return db.close();
    });
}

module.exports = { seed };
