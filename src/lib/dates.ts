/**
 * Date helpers.
 *
 * The club operates entirely in Europe/London, and every stored calendar value
 * is a plain date rather than an instant. These helpers keep that discipline:
 * they build and read dates in UTC so that a round on 25 October does not
 * become 24 October for a server running in a westward timezone, and they
 * format for display using an explicit London timezone.
 */

export const CLUB_TIMEZONE = 'Europe/London';

/** Builds a UTC-midnight Date from a `YYYY-MM-DD` string. */
export function parseCalendarDate(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) {
    throw new Error(`"${input}" is not a valid date. Use YYYY-MM-DD.`);
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${input}" is not a valid date.`);
  }
  // Reject impossible dates that Date.UTC silently rolls over, e.g. 31 February.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`"${input}" is not a real calendar date.`);
  }
  return date;
}

/** Formats a stored calendar date back to `YYYY-MM-DD`, for form fields. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Long human date, e.g. "Tuesday 24 March 2026". */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Short human date, e.g. "24 Mar 2026". */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Timestamp for "last updated" lines, in club local time. */
export function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CLUB_TIMEZONE,
  }).format(date);
}

/** Today as a UTC-midnight calendar date. */
export function todayCalendar(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The club year label a date falls in, e.g. "2025/26" for a winter season.
 *
 * The club year runs October to September, matching the winter-then-summer
 * season pairing.
 */
export function clubYearLabel(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
