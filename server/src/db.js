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

  // Quizzes belong to the planner who wrote them, not to an event, so one quiz can be
  // reused across events. A quiz is a flat list of questions, grouped into categories, or
  // split into rounds of categories (with an intermission between rounds). In a flat quiz
  // every question has a null category_id; outside a rounds quiz every category has a null
  // round_id.
  await sql`
    CREATE TABLE IF NOT EXISTS quizzes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      structure   TEXT NOT NULL DEFAULT 'flat',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Replaced rather than declared inline, so quizzes made before rounds existed accept them.
  await sql`ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_structure_check`;
  await sql`
    ALTER TABLE quizzes ADD CONSTRAINT quizzes_structure_check
      CHECK (structure IN ('flat', 'categorized', 'rounds'))
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS quizzes_owner_id_idx ON quizzes (owner_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS quiz_rounds (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id    UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      position   INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS quiz_rounds_quiz_id_idx ON quiz_rounds (quiz_id, position)
  `;

  // position is the planner's chosen order. Gaps are fine; only the relative order matters.
  await sql`
    CREATE TABLE IF NOT EXISTS quiz_categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id    UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      position   INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS quiz_categories_quiz_id_idx ON quiz_categories (quiz_id, position)
  `;
  // A rounds quiz's categories each belong to a round, positioned within it. Deleting a
  // round deletes its categories and their questions.
  await sql`
    ALTER TABLE quiz_categories ADD COLUMN IF NOT EXISTS round_id UUID
      REFERENCES quiz_rounds(id) ON DELETE CASCADE
  `;
  // The type new questions in the category start as; each question keeps its own type.
  await sql`
    ALTER TABLE quiz_categories ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL
      DEFAULT 'multiple_choice'
      CHECK (question_type IN ('multiple_choice', 'written', 'true_false'))
  `;

  // choices: multiple choice only, a JSON array of strings.
  // answer: the index of the correct choice, true/false, or the expected written answer.
  await sql`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      category_id   UUID REFERENCES quiz_categories(id) ON DELETE CASCADE,
      position      INTEGER NOT NULL,
      question_type TEXT NOT NULL
                      CHECK (question_type IN ('multiple_choice', 'written', 'true_false')),
      prompt        TEXT NOT NULL,
      choices       JSONB,
      answer        JSONB NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS quiz_questions_quiz_id_idx
      ON quiz_questions (quiz_id, category_id, position)
  `;
  // media: up to four { kind: 'image' | 'video' | 'audio' | 'youtube', url, name } shown with
  // the question.
  await sql`
    ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb
  `;
  // Prompts are formatted HTML, always starting with a tag, or empty when media stands in for
  // the question. Plain-text prompts from before formatting become an escaped paragraph.
  await sql`
    UPDATE quiz_questions
    SET prompt = '<p>' || replace(replace(replace(prompt, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
                 || '</p>'
    WHERE prompt NOT LIKE '<%' AND prompt <> ''
  `;

  // Each event plays at most one quiz. Deleting the quiz leaves the event without one.
  await sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL
  `;
}

module.exports = { sql, db, schema, initSchema };
