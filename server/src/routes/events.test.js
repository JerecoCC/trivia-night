'use strict';

jest.mock('../db', () => ({ sql: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  },
}));
jest.mock('../lib/events', () => {
  const actual = jest.requireActual('../lib/events');
  return {
    ...actual,
    fetchEvents: jest.fn(),
    findOwnedEvent: jest.fn(),
  };
});

const request = require('supertest');
const express = require('express');
const { sql } = require('../db');
const { HttpError, errorHandler } = require('../middleware/errors');
const { fetchEvents, findOwnedEvent } = require('../lib/events');
const router = require('./events');

const app = express();
app.use(express.json());
app.use('/api/events', router);
app.use(errorHandler);

const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const SHAPED = { id: EVENT_ID, name: 'Pub Quiz', is_owner: true };
const BODY = {
  name: 'Pub Quiz',
  scheduled_date: '2026-11-20',
  scheduled_start: '19:30',
  location: 'The Crown',
};

const STORED = {
  id: EVENT_ID,
  owner_id: 'user-1',
  ...BODY,
  is_online: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchEvents.mockResolvedValue([SHAPED]);
  findOwnedEvent.mockResolvedValue(STORED);
});

describe('GET /api/events', () => {
  it('lists every event for the signed-in user', async () => {
    const res = await request(app).get('/api/events');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([SHAPED]);
    expect(fetchEvents).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /api/events/:id', () => {
  it('returns one event', async () => {
    const res = await request(app).get(`/api/events/${EVENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(SHAPED);
    expect(fetchEvents).toHaveBeenCalledWith('user-1', { id: EVENT_ID });
  });

  it('is a 404 for a malformed or unknown id', async () => {
    expect((await request(app).get('/api/events/nope')).status).toBe(404);

    fetchEvents.mockResolvedValueOnce([]);
    expect((await request(app).get(`/api/events/${EVENT_ID}`)).status).toBe(404);
  });
});

describe('POST /api/events', () => {
  it('creates the event owned by the user and returns it shaped', async () => {
    sql.mockResolvedValueOnce([{ id: EVENT_ID }]);

    const res = await request(app).post('/api/events').send(BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(SHAPED);
    expect(sql.mock.calls[0][0].join('?')).toContain('INSERT INTO events');
    expect(sql.mock.calls[0].slice(1)).toEqual([
      'user-1',
      'Pub Quiz',
      '2026-11-20',
      '19:30',
      false,
      'The Crown',
    ]);
  });

  it('creates an online event without a location', async () => {
    sql.mockResolvedValueOnce([{ id: EVENT_ID }]);

    const res = await request(app)
      .post('/api/events')
      .send({ ...BODY, is_online: true, location: undefined });

    expect(res.status).toBe(201);
    expect(sql.mock.calls[0].slice(-2)).toEqual([true, null]);
  });

  it('rejects an invalid body without saving', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ ...BODY, scheduled_start: '7pm' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduled_start/);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/events/:id', () => {
  it('merges the fields sent onto the stored event', async () => {
    sql.mockResolvedValueOnce([]);

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}`)
      .send({ location: 'The Anchor' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(SHAPED);
    expect(findOwnedEvent).toHaveBeenCalledWith('user-1', EVENT_ID);
    expect(sql.mock.calls[0][0].join('?')).toContain('UPDATE events SET');
    expect(sql.mock.calls[0].slice(1)).toEqual([
      'Pub Quiz',
      '2026-11-20',
      '19:30',
      false,
      'The Anchor',
      EVENT_ID,
      'user-1',
    ]);
  });

  it('clears the location when an event moves online', async () => {
    sql.mockResolvedValueOnce([]);

    const res = await request(app).patch(`/api/events/${EVENT_ID}`).send({ is_online: true });

    expect(res.status).toBe(200);
    expect(sql.mock.calls[0].slice(4, 6)).toEqual([true, null]);
  });

  it('requires a location when an online event moves in person', async () => {
    findOwnedEvent.mockResolvedValueOnce({ ...STORED, is_online: true, location: null });

    const res = await request(app).patch(`/api/events/${EVENT_ID}`).send({ is_online: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location is required/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses another planner's event", async () => {
    findOwnedEvent.mockRejectedValueOnce(
      new HttpError(403, 'Only the event planner can change this event'),
    );

    const res = await request(app).patch(`/api/events/${EVENT_ID}`).send({ name: 'Mine now' });

    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/events/:id', () => {
  it('deletes the planner’s event', async () => {
    sql.mockResolvedValueOnce([]);

    const res = await request(app).delete(`/api/events/${EVENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, deleted: true });
    expect(sql.mock.calls[0][0].join('?')).toContain('DELETE FROM events');
  });

  it('is a 404 for an unknown event', async () => {
    findOwnedEvent.mockRejectedValueOnce(new HttpError(404, 'Event not found'));

    const res = await request(app).delete(`/api/events/${EVENT_ID}`);

    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});
