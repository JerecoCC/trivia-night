import {
  eventDayOfMonth,
  formatEventDate,
  formatEventStart,
  groupEventsByMonth,
  splitEventsByDate,
  todayDateKey,
} from './eventSchedule';

describe('eventSchedule', () => {
  it('formats the calendar date without shifting the day', () => {
    expect(formatEventDate('2026-11-20')).toBe('Fri, Nov 20, 2026');
    expect(formatEventDate('2027-01-01')).toBe('Fri, Jan 1, 2027');
    expect(eventDayOfMonth('2026-11-01')).toBe('1');
  });

  it.each([
    ['00:05', '12:05 AM'],
    ['09:00', '9:00 AM'],
    ['12:00', '12:00 PM'],
    ['19:30', '7:30 PM'],
  ])('formats %s as %s', (time, expected) => {
    expect(formatEventStart(time)).toBe(expected);
  });

  it("builds today's local date key", () => {
    expect(todayDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('splits events into upcoming (soonest first) and past (most recent first)', () => {
    const events = [
      { id: 'a', scheduled_date: '2026-10-01' },
      { id: 'b', scheduled_date: '2026-10-15' },
      { id: 'c', scheduled_date: '2026-11-06' },
      { id: 'd', scheduled_date: '2026-12-01' },
    ];

    const { upcoming, past } = splitEventsByDate(events, '2026-11-06');

    expect(upcoming.map((event) => event.id)).toEqual(['c', 'd']);
    expect(past.map((event) => event.id)).toEqual(['b', 'a']);
  });

  it('groups events by month in the order given', () => {
    const groups = groupEventsByMonth([
      { id: 'a', scheduled_date: '2026-11-30' },
      { id: 'b', scheduled_date: '2026-11-02' },
      { id: 'c', scheduled_date: '2026-10-15' },
      { id: 'd', scheduled_date: '2027-01-01' },
    ]);

    expect(groups.map(({ key, label, events }) => [key, label, events.map((e) => e.id)])).toEqual([
      ['2026-11', 'November 2026', ['a', 'b']],
      ['2026-10', 'October 2026', ['c']],
      ['2027-01', 'January 2027', ['d']],
    ]);
  });
});
