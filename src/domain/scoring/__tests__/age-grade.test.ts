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
  AGE_FACTOR_DISTANCES_METRES,
  FEMALE_OPEN_CLASS_STANDARDS_2025,
  FEMALE_ROAD_FACTORS_2025,
  MALE_OPEN_CLASS_STANDARDS_2025,
  MALE_ROAD_FACTORS_2025,
} from '../age-grade/data/alan-jones-road-2025';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('vendored Alan Jones 2025 road factors', () => {
  it('covers every single year of age from 5 to 100 for both categories', () => {
    for (const table of [MALE_ROAD_FACTORS_2025, FEMALE_ROAD_FACTORS_2025]) {
      for (let age = MIN_TABLE_AGE; age <= MAX_TABLE_AGE; age += 1) {
        const row = table[age];
        expect(row, `missing age ${age}`).toBeDefined();
        expect(row).toHaveLength(4);
        for (const value of row as readonly number[]) {
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
      expect(Object.keys(table)).toHaveLength(MAX_TABLE_AGE - MIN_TABLE_AGE + 1);
    }
  });

  it('matches published spot values from the source workbooks', () => {
    // Sampled directly from the "Age Facctors" worksheets. These pin the
    // vendored copy to its source: a corrupted regeneration would break here.
    expect(AGE_FACTOR_DISTANCES_METRES).toEqual([5000, 6000, 6437.376, 8000]);
    expect(MALE_OPEN_CLASS_STANDARDS_2025).toEqual([769, 930, 1000, 1255]);
    expect(FEMALE_OPEN_CLASS_STANDARDS_2025).toEqual([834, 1010, 1087, 1365]);
    expect(MALE_ROAD_FACTORS_2025[40]).toEqual([0.9475, 0.9517, 0.9534, 0.9584]);
    expect(FEMALE_ROAD_FACTORS_2025[50]).toEqual([0.8592, 0.8652, 0.8676, 0.8748]);
    expect(MALE_ROAD_FACTORS_2025[5]).toEqual([0.608, 0.5815, 0.5713, 0.5397]);
    expect(FEMALE_ROAD_FACTORS_2025[100]).toEqual([0.1692, 0.1635, 0.1614, 0.1546]);
  });

  it('reduces the 5 km factor monotonically through the masters ages', () => {
    for (const table of [MALE_ROAD_FACTORS_2025, FEMALE_ROAD_FACTORS_2025]) {
      for (let age = 35; age < MAX_TABLE_AGE; age += 1) {
        const current = (table[age] as readonly number[])[0] as number;
        const next = (table[age + 1] as readonly number[])[0] as number;
        expect(next, `age ${age} -> ${age + 1}`).toBeLessThan(current);
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
  it('derives table-native standards from the open standard and age factor', () => {
    expect(ageStandardSeconds('MALE', 40, 5000)).toBeCloseTo(769 / 0.9475, 10);
    expect(ageStandardSeconds('MALE', 40, 6000)).toBeCloseTo(930 / 0.9517, 10);
    expect(ageStandardSeconds('MALE', 40, 8000)).toBeCloseTo(1255 / 0.9584, 10);
  });

  it('interpolates 7.5 km like RunBundle between 4 miles and 8 km', () => {
    const weight = (7500 - 6437.376) / (8000 - 6437.376);
    const openStandard = 1000 * (1 - weight) + 1255 * weight;
    const ageFactor = 0.9534 * (1 - weight) + 0.9584 * weight;

    expect(ageStandardSeconds('MALE', 40, 7500)).toBeCloseTo(openStandard / ageFactor, 10);
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
    const standardSeconds = 769 / 0.9475;
    const outcome = calculateAgeGrade({
      category: 'MALE',
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
      elapsedMilliseconds: standardSeconds * 1000,
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
    expect(outcome.percent).toBeCloseTo(73.0521601, 8);
    expect(outcome.displayPercent).toBe(73.05);
    expect(outcome.percent).not.toBe(outcome.displayPercent);
  });

  it('matches current RunBundle for a native road distance', () => {
    const outcome = calculateAgeGrade({
      category: 'FEMALE',
      dateOfBirth: utc('1976-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
      elapsedMilliseconds: 20 * 60 * 1000,
    });

    expect(outcome.percent).toBeCloseTo(80.8891992551, 9);
    expect(outcome.displayPercent).toBe(80.89);
  });

  it('matches current RunBundle for a male native road distance', () => {
    const outcome = calculateAgeGrade({
      category: 'MALE',
      dateOfBirth: utc('1986-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 5000,
      elapsedMilliseconds: 20 * 60 * 1000,
    });

    expect(outcome.percent).toBeCloseTo(67.6341248901, 9);
    expect(outcome.displayPercent).toBe(67.63);
  });

  it('matches current RunBundle for the club non-standard 7.5 km distance', () => {
    const outcome = calculateAgeGrade({
      category: 'FEMALE',
      dateOfBirth: utc('1976-01-01'),
      eventDate: utc('2026-01-01'),
      distanceMetres: 7500,
      elapsedMilliseconds: 30 * 60 * 1000,
    });

    expect(outcome.percent).toBeCloseTo(81.2513621145, 9);
    expect(outcome.displayPercent).toBe(81.25);
    expect(outcome.version).toBe('ALAN_JONES_ROAD_2025_RUNBUNDLE_V1');
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
