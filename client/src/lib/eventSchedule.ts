// Event dates and start times are the venue's local wall-clock values ("2026-11-20", "19:30"),
// shown exactly as the planner entered them rather than converted to the viewer's time zone.

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Parses a YYYY-MM-DD key at local noon so the calendar day never shifts. */
const fromDateKey = (dateKey: string) => new Date(`${dateKey}T12:00:00`);

/** "2026-11-20" → "Fri, Nov 20, 2026". */
export const formatEventDate = (dateKey: string): string => DATE_FMT.format(fromDateKey(dateKey));

/** "19:30" → "7:30 PM". */
export const formatEventStart = (time: string): string => {
  const [hStr, mStr = '00'] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
};

/** "2026-11-20" → "20", for the list's date badge. */
export const eventDayOfMonth = (dateKey: string): string => String(fromDateKey(dateKey).getDate());

/** Today's YYYY-MM-DD key in the viewer's local time zone. */
export const todayDateKey = (now: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export interface EventMonthGroup<T> {
  /** "2026-11". */
  key: string;
  /** "November 2026". */
  label: string;
  events: T[];
}

/** Groups consecutive events by calendar month, keeping the order they arrive in. */
export const groupEventsByMonth = <T extends { scheduled_date: string }>(
  events: T[],
): EventMonthGroup<T>[] => {
  const groups: EventMonthGroup<T>[] = [];
  for (const event of events) {
    const key = event.scheduled_date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label: MONTH_FMT.format(fromDateKey(`${key}-01`)), events: [event] });
    }
  }
  return groups;
};

/**
 * Splits events into upcoming (today onward, soonest first) and past (most recent first).
 * Expects the list in the server's soonest-first order.
 */
export const splitEventsByDate = <T extends { scheduled_date: string }>(
  events: T[],
  today: string = todayDateKey(),
): { upcoming: T[]; past: T[] } => ({
  upcoming: events.filter((event) => event.scheduled_date >= today),
  past: events.filter((event) => event.scheduled_date < today).reverse(),
});
