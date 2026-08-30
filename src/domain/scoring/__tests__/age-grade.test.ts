import { describe, expect, it } from 'vitest';
import {
  AGE_GRADE_VERSION,
  AgeGradeError,
  MAX_TABLE_AGE,
  MIN_TABLE_AGE,
  ageOnDate,
  ageStandardSeconds,
  calculateAgeGrade,
  roundToTwoDecimals,
} from '../age-grade';
import {
  FEMALE_ROAD_STANDARDS_2015,
  MALE_ROAD_STANDARDS_2015,
} from '../age-grade/data/wma-road-2015';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('vendored WMA 2015 road standards', () => {
  it('covers every single year of age from 5 to 100 for both categories', () => {
    for (const table of [MALE_ROAD_STANDARDS_2015, FEMALE_ROAD_STANDARDS_2015]) {
      for (let age = MIN_TABLE_AGE; age <= MAX_TABLE_AGE; age += 1) {
        const row = table[age];
        expect(row, `missing age ${age}`).toBeDefined();
        expect(row).toHaveLength(4);
        for (const value of row as readonly number[]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
      }
      expect(Object.keys(table)).toHaveLength(MAX_TABLE_AGE - MIN_TABLE_AGE + 1);
    }
  });

  it('matches published spot values from the source workbooks', () => {
    // Sampled directly from the "AgeStdSec" worksheets. These pin the vendored
    // copy to its source: a corrupted regeneration would break here first.
    expect(MALE_ROAD_STANDARDS_2015[40]).toEqual([823, 990, 1328, 1663]);
    expect(FEMALE_ROAD_STANDARDS_2015[40]).toEqual([910, 1101, 1484, 1874]);
    expect(MALE_ROAD_STANDARDS_2015[5]).toEqual([1286, 1555, 2100, 2647]);
    expect(FEMALE_ROAD_STANDARDS_2015[100]).toEqual([4641, 6099, 9524, 13736]);
  });

  it('grows monotonically with distance at every age', () => {
    for (const table of [MALE_ROAD_STANDARDS_2015, FEMALE_ROAD_STANDARDS_2015]) {
      for (let age = MIN_TABLE_AGE; age <= MAX_TABLE_AGE; age += 1) {
        const row = table[age] as readonly number[];
        for (let i = 1; i < row.length; i += 1) {
          expect(row[i] as number, `age ${age}, distance index ${i}`).toBeGreaterThan(
            row[i - 1] as number,
          );
        }
      }
    }
  });

  it('slows monotonically through the masters ages', () => {
    // Standards improve into the athletic peak and then decline; from 35 upward
    // every extra year must be slower, which is what age grading relies on.
    for (const table of [MALE_ROAD_STANDARDS_2015, FEMALE_ROAD_STANDARDS_2015]) {
      for (let age = 35; age < MAX_TABLE_AGE; age += 1) {
        const current = (table[age] as readonly number[])[0] as number;
        const next = (table[age + 1] as readonly number[])[0] as number;
        expect(next, `age ${age} -> ${age + 1}`).toBeGreaterThan(current);
      }
    }
  });
});

describe('ageOnDate', () => {
  it('counts completed years', () => {
    expect(ageOnDate(utc('1980-03-01'), utc('2026-02-28'))).toBe(45);
    expect(ageOnDate(utc('1980-03-01'), utc('2026-03-01'))).toBe(46);
    expect(ageOnDate(utc('1980-03-01'), utc('2026-03-02'))).toBe(46);
  });

  it('treats a birthday on the round date as the new age', () => {
    expect(ageOnDate(utc('2000-06-15'), utc('2026-06-15'))).toBe(26);
    expect(ageOnDate(utc('2000-06-15'), utc('2026-06-14'))).toBe(25);
  });

  it('handles 29 February births in non-leap years', () => {
    // A leapling has not had a birthday by 28 February in a common year.
    expect(ageOnDate(utc('2004-02-29'), utc('2026-02-28'))).toBe(21);
    expect(ageOnDate(utc('2004-02-29'), utc('2026-03-01'))).toBe(22);
  });

  it('handles a 31 December birth on 1 January', () => {
    expect(ageOnDate(utc('1990-12-31'), utc('2026-01-01'))).toBe(35);
  });
});

describe('ageStandardSeconds', () => {
  it('uses table-native standards directly', () => {
    expect(ageStandardSeconds('MALE', 40, 5000)).toBe(823);
    expect(ageStandardSeconds('MALE', 40, 6000)).toBe(990);
    expect(ageStandardSeconds('MALE', 40, 8000)).toBe(1328);
  });

  it('interpolates 7.5 km logarithmically between the 5 km and 10 km standards', () => {
    const weight = (Math.log(7500) - Math.log(5000)) / (Math.log(10000) - Math.log(5000));
    const expected = 823 * (1 - weight) + 1663 * weight;

    expect(ageStandardSeconds('MALE', 40, 7500)).toBeCloseTo(expected, 9);
    // Sits between the two neighbours and above the linear midpoint, because
    // pace decays faster than distance grows.
    expect(ageStandardSeconds('MALE', 40, 7500)).toBeGreaterThan(823);
    expect(ageStandardSeconds('MALE', 40, 7500)).toBeLessThan(1663);
    expect(ageStandardSeconds('MALE', 40, 7500)).toBeGreaterThan((823 + 1663) / 2 - 60);
  });

  it('refuses ages outside the published tables instead of inventing a factor', () => {
    expect(() => ageStandardSeconds('MALE', 4, 5000)).toThrow(AgeGradeError);
    expect(() => ageStandardSeconds('MALE', 101, 5000)).toThrow(/outside the published/);
    expect(() => ageStandardSeconds('FEMALE', 4, 5000)).toThrowError(
      expect.objectContaining({ code: 'AGE_OUT_OF_RANGE' }),
    );
  });

  it('accepts the exact table boundaries', () => {
    expect(() => ageStandardSeconds('MALE', MIN_TABLE_AGE, 5000)).not.toThrow();
    expect(() => ageStandardSeconds('MALE', MAX_TABLE_AGE, 5000)).not.toThrow();
  });
});

describe('calculateAgeGrade', () => {
  it('scores 100% for a runner exactly on the standard', () => {
    const outcome = calculateAgeGrade({
      category: 'MALE',
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
      elapsedMilliseconds: 823 * 1000,
    });
    expect(outcome.ageOnEventDate).toBe(40);
    expect(outcome.percent).toBeCloseTo(100, 10);
    expect(outcome.displayPercent).toBe(100);
    expect(outcome.version).toBe(AGE_GRADE_VERSION);
  });

  it('scores below 100% for a slower run and above for a faster one', () => {
    const base = {
      category: 'FEMALE' as const,
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
    };
    const slow = calculateAgeGrade({ ...base, elapsedMilliseconds: 1200 * 1000 });
    const fast = calculateAgeGrade({ ...base, elapsedMilliseconds: 800 * 1000 });
    expect(slow.percent).toBeLessThan(100);
    expect(fast.percent).toBeGreaterThan(100);
  });

  it('retains full precision for ranking and rounds only for display', () => {
    const outcome = calculateAgeGrade({
      category: 'MALE',
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
      elapsedMilliseconds: 1111 * 1000,
    });
    // 823 / 1111 * 100 = 74.0774...
    expect(outcome.percent).toBeCloseTo(74.07740774, 8);
    expect(outcome.displayPercent).toBe(74.08);
    expect(outcome.percent).not.toBe(outcome.displayPercent);
  });

  it('rejects unsupported distances and non-positive times', () => {
    const base = {
      category: 'MALE' as const,
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
    };
    expect(() =>
      calculateAgeGrade({ ...base, distanceMetres: 10000, elapsedMilliseconds: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_DISTANCE' }));
    expect(() =>
      calculateAgeGrade({ ...base, distanceMetres: 5000, elapsedMilliseconds: 0 }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_TIME' }));
  });
});

describe('roundToTwoDecimals', () => {
  it('rounds half away from zero', () => {
    expect(roundToTwoDecimals(74.125)).toBe(74.13);
    expect(roundToTwoDecimals(74.124)).toBe(74.12);
    expect(roundToTwoDecimals(1.005)).toBe(1.01);
    expect(roundToTwoDecimals(100)).toBe(100);
  });
});
