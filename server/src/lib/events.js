'use strict';

const { sql } = require('../db');
const { HttpError } = require('../middleware/errors');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 120;
const LOCATION_MAX = 200;

const badRequest = (message) => new HttpError(400, message);

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

// The regex alone lets through dates like 2026-02-31, which Postgres rejects.
const isCalendarDate = (value) =>
  DATE_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const toText = (value, name, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`${name} is required`);
  if (text.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return text;
};

/**
 * Validates a complete event. Online events drop any location; in-person events
 * require one. PATCH merges its changes onto the stored event before calling this,
 * so switching an online event to in-person must also send a location.
 */
function normalizeEventInput(body = {}) {
  const input = body ?? {};
  const name = toText(input.name, 'name', NAME_MAX);

  const date = String(input.scheduled_date ?? '');
  if (!isCalendarDate(date)) throw badRequest('scheduled_date must be a YYYY-MM-DD date');

  const start = String(input.scheduled_start ?? '');
  if (!TIME_RE.test(start)) throw badRequest('scheduled_start must be HH:MM');

  const isOnline = input.is_online ?? false;
  if (typeof isOnline !== 'boolean') throw badRequest('is_online must be true or false');

  return {
    name,
    scheduled_date: date,
    scheduled_start: start,
    is_online: isOnline,
    location: isOnline ? null : toText(input.location, 'location', LOCATION_MAX),
  };
}

/** Events shaped for the client, soonest first. Pass `id` to fetch a single event. */
function fetchEvents(userId, { id = null } = {}) {
  return sql`
    SELECT
      e.id,
      e.name,
      to_char(e.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
      e.scheduled_start,
      e.is_online,
      e.location,
      e.owner_id,
      u.display_name AS owner_name,
      (e.owner_id = ${userId}) AS is_owner,
      e.created_at,
      e.updated_at
    FROM events e
    JOIN users u ON u.id = e.owner_id
    WHERE ${id}::uuid IS NULL OR e.id = ${id}::uuid
    ORDER BY e.scheduled_date, e.scheduled_start, e.created_at
  `;
}

/**
 * Loads the editable fields of an event the user may change. Unknown ids are a 404;
 * another planner's event is a 403, since every signed-in user can already see it exists.
 */
async function findOwnedEvent(userId, id) {
  if (!isUuid(id)) throw new HttpError(404, 'Event not found');
  const [event] = await sql`
    SELECT id, owner_id, name, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
           scheduled_start, is_online, location
    FROM events WHERE id = ${id}
  `;
  if (!event) throw new HttpError(404, 'Event not found');
  if (event.owner_id !== userId) {
    throw new HttpError(403, 'Only the event planner can change this event');
  }
  return event;
}

module.exports = { fetchEvents, findOwnedEvent, isUuid, normalizeEventInput };
