'use strict';

jest.mock('../db', () => ({ sql: jest.fn() }));

const { sql } = require('../db');
const { findOwnedEvent, normalizeEventInput } = require('./events');

const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const VALID = {
  name: '  Pub Quiz  ',
  scheduled_date: '2026-11-20',
  scheduled_start: '19:30',
  location: ' The Crown ',
};

beforeEach(() => jest.clearAllMocks());

describe('normalizeEventInput', () => {
  it('trims and returns every field, in person by default', () => {
    expect(normalizeEventInput(VALID)).toEqual({
      name: 'Pub Quiz',
      scheduled_date: '2026-11-20',
      scheduled_start: '19:30',
      is_online: false,
      location: 'The Crown',
      quiz_id: null,
    });
  });

  it('drops the location of an online event', () => {
    expect(normalizeEventInput({ ...VALID, is_online: true, location: '' })).toMatchObject({
      is_online: true,
      location: null,
    });
    expect(normalizeEventInput({ ...VALID, is_online: true })).toMatchObject({ location: null });
  });

  it.each([
    ['name', { name: '   ' }, /name is required/],
    ['an in-person event without a location', { location: '' }, /location is required/],
    ['a missing location', { location: null }, /location is required/],
    ['a non-boolean is_online', { is_online: 'yes' }, /is_online/],
    ['a long name', { name: 'x'.repeat(121) }, /at most 120/],
    ['a malformed date', { scheduled_date: '11/20/2026' }, /scheduled_date/],
    ['an impossible date', { scheduled_date: '2026-02-31' }, /scheduled_date/],
    ['a malformed start', { scheduled_start: '7:30 PM' }, /scheduled_start/],
    ['an out-of-range start', { scheduled_start: '24:00' }, /scheduled_start/],
  ])('rejects %s with a 400', (_label, override, message) => {
    expect(() => normalizeEventInput({ ...VALID, ...override })).toThrow(message);
    try {
      normalizeEventInput({ ...VALID, ...override });
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('requires every field', () => {
    expect(() => normalizeEventInput({ name: 'Pub Quiz' })).toThrow(/scheduled_date/);
  });
});

describe('findOwnedEvent', () => {
  it('returns the event for its planner', async () => {
    sql.mockResolvedValueOnce([{ id: EVENT_ID, owner_id: 'user-1' }]);
    await expect(findOwnedEvent('user-1', EVENT_ID)).resolves.toEqual({
      id: EVENT_ID,
      owner_id: 'user-1',
    });
  });

  it('is a 404 for a malformed id without querying', async () => {
    await expect(findOwnedEvent('user-1', 'nope')).rejects.toMatchObject({ status: 404 });
    expect(sql).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown event', async () => {
    sql.mockResolvedValueOnce([]);
    await expect(findOwnedEvent('user-1', EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("is a 403 for another planner's event", async () => {
    sql.mockResolvedValueOnce([{ id: EVENT_ID, owner_id: 'user-2' }]);
    await expect(findOwnedEvent('user-1', EVENT_ID)).rejects.toMatchObject({ status: 403 });
  });
});
