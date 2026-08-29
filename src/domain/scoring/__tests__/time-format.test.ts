import { describe, expect, it } from 'vitest';
import { TimeFormatError, formatElapsedTime, parseElapsedTime } from '../time-format';

describe('parseElapsedTime', () => {
  it('parses the shapes a volunteer types from a stopwatch', () => {
    expect(parseElapsedTime('20:00')).toBe(1_200_000);
    expect(parseElapsedTime('19:45')).toBe(1_185_000);
    expect(parseElapsedTime('9:07')).toBe(547_000);
    expect(parseElapsedTime('1:02:03')).toBe(3_723_000);
    expect(parseElapsedTime(' 20:00 ')).toBe(1_200_000);
  });

  it('reads a fraction as tenths, not milliseconds', () => {
    expect(parseElapsedTime('20:00.5')).toBe(1_200_500);
    expect(parseElapsedTime('20:00.05')).toBe(1_200_050);
    expect(parseElapsedTime('20:00.005')).toBe(1_200_005);
  });

  it('always yields an integer, so identical entries compare equal', () => {
    const a = parseElapsedTime('20:00.3');
    const b = parseElapsedTime('20:00.3');
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBe(b);
  });

  it('rejects malformed input with a message a form can display', () => {
    for (const bad of ['', 'abc', '20', '20:60', '::', '20:00:', '-5:00', '20;00']) {
      expect(() => parseElapsedTime(bad), bad).toThrow(TimeFormatError);
    }
    expect(() => parseElapsedTime('20:61')).toThrow(/Seconds must be below 60/);
    expect(() => parseElapsedTime('0:00')).toThrow(/greater than zero/);
  });

  it('rejects minutes of 60 or more only when an hours field is present', () => {
    expect(() => parseElapsedTime('1:60:00')).toThrow(/Minutes must be below 60/);
    // Without an hours field, "90:00" unambiguously means ninety minutes, so it
    // is accepted rather than forcing a volunteer to convert it themselves.
    expect(parseElapsedTime('90:00')).toBe(5_400_000);
    expect(formatElapsedTime(parseElapsedTime('90:00'))).toBe('1:30:00');
  });
});

describe('formatElapsedTime', () => {
  it('formats sub-hour times as mm:ss', () => {
    expect(formatElapsedTime(1_200_000)).toBe('20:00');
    expect(formatElapsedTime(547_000)).toBe('9:07');
  });

  it('adds an hours field once the time reaches an hour', () => {
    expect(formatElapsedTime(3_723_000)).toBe('1:02:03');
  });

  it('shows tenths only when asked and only when non-zero', () => {
    expect(formatElapsedTime(1_200_500, { tenths: true })).toBe('20:00.5');
    expect(formatElapsedTime(1_200_000, { tenths: true })).toBe('20:00');
    // Whole-second precision rounds up, so a displayed time never understates
    // what the runner ran.
    expect(formatElapsedTime(1_200_500)).toBe('20:01');
    expect(formatElapsedTime(1_200_001)).toBe('20:01');
    expect(formatElapsedTime(1_200_000)).toBe('20:00');
  });

  it('round-trips through parse without drift', () => {
    for (const text of ['20:00', '9:07', '1:02:03', '25:59']) {
      expect(formatElapsedTime(parseElapsedTime(text))).toBe(text);
    }
  });

  it('renders an em dash for a missing or invalid value', () => {
    expect(formatElapsedTime(Number.NaN)).toBe('—');
    expect(formatElapsedTime(-1)).toBe('—');
  });
});
