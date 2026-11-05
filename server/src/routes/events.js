'use strict';

// Trivia night events. Every signed-in user can see all events; only the event's
// planner (the user who created it) can edit or delete it.

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { HttpError, asyncRoute } = require('../middleware/errors');
const { sql } = require('../db');
const { fetchEvents, findOwnedEvent, isUuid, normalizeEventInput } = require('../lib/events');
const { assertOwnQuiz } = require('../lib/quizzes');

router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/events  – every event, soonest first
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncRoute(async (req, res) => res.json(await fetchEvents(req.user.id))),
);

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(404, 'Event not found');
    const [event] = await fetchEvents(req.user.id, { id });
    if (!event) throw new HttpError(404, 'Event not found');
    return res.json(event);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/events  – plan a new event
// Body: { name, scheduled_date: 'YYYY-MM-DD', scheduled_start: 'HH:MM', is_online?, location?,
//         quiz_id? }
// location is required unless is_online is true. quiz_id must be one of the planner's quizzes.
// ---------------------------------------------------------------------------
router.post(
  '/',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const input = normalizeEventInput(req.body);
    await assertOwnQuiz(userId, input.quiz_id);
    const [created] = await sql`
      INSERT INTO events (owner_id, name, scheduled_date, scheduled_start, is_online, location, quiz_id)
      VALUES (
        ${userId}, ${input.name}, ${input.scheduled_date}::date, ${input.scheduled_start},
        ${input.is_online}, ${input.location}, ${input.quiz_id}
      )
      RETURNING id
    `;
    const [event] = await fetchEvents(userId, { id: created.id });
    return res.status(201).json(event);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/events/:id  – edit any of the fields above (planner only)
// The changes are merged onto the stored event and the result is validated as a whole.
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const current = await findOwnedEvent(userId, id);
    const input = normalizeEventInput({ ...current, ...req.body });
    if (input.quiz_id !== current.quiz_id) await assertOwnQuiz(userId, input.quiz_id);
    await sql`
      UPDATE events SET
        name            = ${input.name},
        scheduled_date  = ${input.scheduled_date}::date,
        scheduled_start = ${input.scheduled_start},
        is_online       = ${input.is_online},
        location        = ${input.location},
        quiz_id         = ${input.quiz_id},
        updated_at      = NOW()
      WHERE id = ${id} AND owner_id = ${userId}
    `;
    const [event] = await fetchEvents(userId, { id });
    return res.json(event);
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/events/:id  – cancel the event (planner only)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    await findOwnedEvent(userId, id);
    await sql`DELETE FROM events WHERE id = ${id} AND owner_id = ${userId}`;
    return res.json({ id, deleted: true });
  }),
);

module.exports = router;
