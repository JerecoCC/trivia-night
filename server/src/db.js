const crypto = require('crypto');
const fs = require('fs');
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

// Fingerprint of every file that participates in schema setup, so the setup
// reruns whenever this code changes and is skipped on every other cold start.
const SCHEMA_SETUP_FILES = [__filename, require.resolve('./db/migrations')];
const schemaHash = crypto.createHash('sha256');
for (const file of SCHEMA_SETUP_FILES) {
  // Normalize line endings so a Windows checkout and Vercel agree on the hash.
  schemaHash.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
}
const SCHEMA_SETUP_MIGRATION = `schema_setup:${schemaHash.digest('hex').slice(0, 16)}`;

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

  // Trivia night events. The creator is the event's planner; scheduled_start is
  // the venue's local "HH:MM" wall-clock time, stored as entered. Online events
  // have no location; in-person events always have one.
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      scheduled_date  DATE NOT NULL,
      scheduled_start TEXT NOT NULL,
      is_online       BOOLEAN NOT NULL DEFAULT false,
      location        TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Events created before online events existed.
  await sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    ALTER TABLE events ALTER COLUMN location DROP NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS events_scheduled_date_idx ON events (scheduled_date)
  `;
}

module.exports = { sql, db, schema, initSchema };
