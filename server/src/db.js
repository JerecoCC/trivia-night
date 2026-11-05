const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const schema = require('./schema');
const { ensureMigrationLedger } = require('./db/migrations');

const rawUrl = process.env.POSTGRES_URL;

if (!rawUrl) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// Append a startup option so every Neon HTTP session uses US Eastern time.
// This ensures NOW(), CURRENT_TIMESTAMP, and TIMESTAMPTZ display all use
// America/New_York regardless of where the server process runs.
const sep = rawUrl.includes('?') ? '&' : '?';
const connectionString = `${rawUrl}${sep}options=-c%20TimeZone%3DAmerica/New_York`;

// `sql` is a tagged-template function – every call opens a pooled HTTP connection
const sql = neon(connectionString);
const db = drizzle(sql, { schema });

const SCHEMA_SETUP_MIGRATION = '0001_initial_schema';

async function initSchema() {
  await ensureMigrationLedger(sql);

  const applied = await sql`
    SELECT 1 FROM _migrations WHERE name = ${SCHEMA_SETUP_MIGRATION} LIMIT 1
  `;
  if (applied.length > 0) return;

  await runSchemaSetup();

  await sql`
    INSERT INTO _migrations (name) VALUES (${SCHEMA_SETUP_MIGRATION})
    ON CONFLICT (name) DO NOTHING
  `;
  console.log('Database schema ready');
}

async function runSchemaSetup() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id    TEXT UNIQUE,
      display_name TEXT NOT NULL,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT,
      photo        TEXT,
      role         TEXT NOT NULL DEFAULT 'user',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

module.exports = { sql, db, schema, initSchema };
