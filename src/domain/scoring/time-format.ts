/**
 * Elapsed-time parsing and formatting.
 *
 * Times are integer milliseconds throughout the system. Floating-point seconds
 * would make two runners who typed the same time compare unequal, which would
 * silently break the tie rules, so no part of the domain stores a float here.
 */

const TIME_PATTERN = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/;

export class TimeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeFormatError';
  }
}

/**
 * Parses `mm:ss`, `mm:ss.t`, `h:mm:ss` or `hh:mm:ss.ttt` into milliseconds.
 *
 * Accepts the shapes a volunteer would naturally type from a stopwatch and
 * rejects everything else with a message the admin form can show verbatim.
 */
export function parseElapsedTime(input: string): number {
  const trimmed = input.trim();
  const match = TIME_PATTERN.exec(trimmed);
  if (!match) {
    throw new TimeFormatError(
      `"${input}" is not a recognised time. Use mm:ss, mm:ss.t or hh:mm:ss.`,
    );
  }

  const [, hoursPart, minutesPart, secondsPart, fractionPart] = match;
  const hours = hoursPart ? Number(hoursPart) : 0;
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);

  if (minutes > 59 && hoursPart) {
    throw new TimeFormatError('Minutes must be below 60 when hours are given.');
  }
  if (seconds > 59) {
    throw new TimeFormatError('Seconds must be below 60.');
  }

  // "12:34.5" means five tenths, not five milliseconds.
  const fraction = fractionPart ? Number(fractionPart.padEnd(3, '0')) : 0;
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction;

  if (total <= 0) {
    throw new TimeFormatError('Elapsed time must be greater than zero.');
  }
  return total;
}

/**
 * Formats milliseconds as `mm:ss`, or `h:mm:ss` once the time reaches an hour.
 *
 * Both precisions round *up* to the next unit, following the athletics
 * convention that a displayed time never understates what the runner actually
 * ran: 20:00.5 shows as 20:01 at whole-second precision, never 20:00.
 */
export function formatElapsedTime(milliseconds: number, options?: { tenths?: boolean }): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '\u2014';

  const showTenths = options?.tenths === true;
  const totalTenths = showTenths ? Math.ceil(milliseconds / 100) : 0;
  const totalSeconds = showTenths ? Math.floor(totalTenths / 10) : Math.ceil(milliseconds / 1000);
  const tenths = showTenths ? totalTenths % 10 : 0;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const base =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;

  return showTenths && tenths > 0 ? `${base}.${tenths}` : base;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
