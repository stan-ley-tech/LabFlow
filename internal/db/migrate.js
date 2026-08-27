'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const config = require('../config');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

function listMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const versions = new Map();

  for (const file of files) {
    const match = file.match(/^(\d+)_([a-z0-9_]+)\.(up|down)\.sql$/);
    if (!match) continue;
    const [, version, name, direction] = match;
    if (!versions.has(version)) versions.set(version, { version, name });
    versions.get(version)[direction] = path.join(MIGRATIONS_DIR, file);
  }

  return Array.from(versions.values()).sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedVersions(client) {
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(rows.map((r) => r.version));
}

async function up(client) {
  await ensureMigrationsTable(client);
  const applied = await getAppliedVersions(client);
  const migrations = listMigrations();
  let ran = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    if (!migration.up) {
      throw new Error(`missing .up.sql for migration ${migration.version}_${migration.name}`);
    }

    const sql = fs.readFileSync(migration.up, 'utf8');
    process.stdout.write(`applying ${migration.version}_${migration.name}\n`);

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
        migration.version,
        migration.name,
      ]);
      await client.query('COMMIT');
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${migration.version}_${migration.name} failed: ${err.message}`);
    }
  }

  if (ran === 0) process.stdout.write('no pending migrations\n');
  return ran;
}

async function down(client) {
  await ensureMigrationsTable(client);
  const { rows } = await client.query(
    'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );

  if (rows.length === 0) {
    process.stdout.write('no migrations to roll back\n');
    return 0;
  }

  const { version, name } = rows[0];
  const migrations = listMigrations();
  const migration = migrations.find((m) => m.version === version);

  if (!migration || !migration.down) {
    throw new Error(`missing .down.sql for migration ${version}_${name}`);
  }

  const sql = fs.readFileSync(migration.down, 'utf8');
  process.stdout.write(`reverting ${version}_${name}\n`);

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`rollback of ${version}_${name} failed: ${err.message}`);
  }

  return 1;
}

async function main() {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) {
    process.stderr.write(`unknown migration command: ${direction}\n`);
    process.exit(1);
  }

  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
  });

  await client.connect();
  try {
    const count = direction === 'up' ? await up(client) : await down(client);
    process.stdout.write(`done (${count} migration${count === 1 ? '' : 's'})\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { listMigrations, up, down };
