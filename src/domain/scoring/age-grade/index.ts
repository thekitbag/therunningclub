import {
  AGE_FACTOR_DISTANCES_METRES,
  FEMALE_OPEN_CLASS_STANDARDS_2025,
  FEMALE_ROAD_FACTORS_2025,
  MALE_OPEN_CLASS_STANDARDS_2025,
  MALE_ROAD_FACTORS_2025,
  MAX_TABLE_AGE,
  MIN_TABLE_AGE,
  type AgeFactorRow,
} from './data/alan-jones-road-2025';
import type { ScoringCategory } from '../types';

/**
 * Identifier for the vendored standards plus the interpolation rules applied on
 * top of them. It is persisted with every calculated result so that adopting a
 * future table edition is a deliberate migration rather than a silent rewrite of
 * published history.
 */
export const AGE_GRADE_VERSION = 'ALAN_JONES_ROAD_2025_RUNBUNDLE_V1';

export { MIN_TABLE_AGE, MAX_TABLE_AGE };

const FOUR_MILES = 6437.376;
const SEVEN_POINT_FIVE_KM = 7500;
const EIGHT_KM = 8000;

/**
 * RunBundle treats `7.5 km` as a non-standard road distance. It linearly
 * interpolates between the closest distances in the source table: 4 miles and
 * 8 km. Its result depends on interpolating both the open standard and the age
 * factor, not a rounded age-standard time.
 */
const RUNBUNDLE_7_5_KM_WEIGHT = (SEVEN_POINT_FIVE_KM - FOUR_MILES) / (EIGHT_KM - FOUR_MILES);

/** Distances the club actually races, in metres. */
export const SUPPORTED_DISTANCES_METRES = [5000, 6000, 7500, 8000] as const;

export type SupportedDistanceMetres = (typeof SUPPORTED_DISTANCES_METRES)[number];

export function isSupportedDistance(metres: number): metres is SupportedDistanceMetres {
  return (SUPPORTED_DISTANCES_METRES as readonly number[]).includes(metres);
}

/** Raised when a result cannot be age-graded, rather than inventing a factor. */
export class AgeGradeError extends Error {
  readonly code: 'AGE_OUT_OF_RANGE' | 'UNSUPPORTED_DISTANCE' | 'INVALID_TIME';

  constructor(code: AgeGradeError['code'], message: string) {
    super(message);
    this.name = 'AgeGradeError';
    this.code = code;
  }
}

function factorsFor(category: ScoringCategory): Readonly<Record<number, AgeFactorRow>> {
  return category === 'MALE' ? MALE_ROAD_FACTORS_2025 : FEMALE_ROAD_FACTORS_2025;
}

function openStandardsFor(category: ScoringCategory): AgeFactorRow {
  return category === 'MALE' ? MALE_OPEN_CLASS_STANDARDS_2025 : FEMALE_OPEN_CLASS_STANDARDS_2025;
}

function tableIndexFor(metres: number): number {
  const index = (AGE_FACTOR_DISTANCES_METRES as readonly number[]).indexOf(metres);
  if (index < 0) {
    throw new AgeGradeError(
      'UNSUPPORTED_DISTANCE',
      `No vendored age factor exists for ${metres} m.`,
    );
  }
  return index;
}

function interpolate(lower: number, upper: number, weight: number): number {
  return lower * (1 - weight) + upper * weight;
}

/**
 * Age in completed years on the event date.
 *
 * Both dates are interpreted in UTC. Round dates are stored as calendar dates
 * and dates of birth are calendar dates too, so no timezone conversion applies:
 * a runner born on 1 March is 40 on their birthday, not the day before.
 */
export function ageOnDate(dateOfBirth: Date, eventDate: Date): number {
  const birthYear = dateOfBirth.getUTCFullYear();
  const birthMonth = dateOfBirth.getUTCMonth();
  const birthDay = dateOfBirth.getUTCDate();

  const eventYear = eventDate.getUTCFullYear();
  const eventMonth = eventDate.getUTCMonth();
  const eventDay = eventDate.getUTCDate();

  let age = eventYear - birthYear;
  const birthdayHasHappened =
    eventMonth > birthMonth || (eventMonth === birthMonth && eventDay >= birthDay);
  if (!birthdayHasHappened) {
    age -= 1;
  }
  return age;
}

/**
 * The RunBundle-compatible age standard, in seconds, for a category, age and
 * road distance.
 *
 * Throws rather than clamping when the age falls outside the published tables:
 * the specification requires publication to be blocked with a clear error.
 */
export function ageStandardSeconds(
  category: ScoringCategory,
  age: number,
  distanceMetres: number,
): number {
  if (!Number.isInteger(age) || age < MIN_TABLE_AGE || age > MAX_TABLE_AGE) {
    throw new AgeGradeError(
      'AGE_OUT_OF_RANGE',
      `Age ${age} is outside the published Alan Jones 2025 road tables (${MIN_TABLE_AGE}-${MAX_TABLE_AGE}).`,
    );
  }

  const factorRow = factorsFor(category)[age];
  /* c8 ignore next 3 -- guarded by the range check above; kept as a hard invariant. */
  if (!factorRow) {
    throw new AgeGradeError('AGE_OUT_OF_RANGE', `No factor row for age ${age}.`);
  }
  const openStandards = openStandardsFor(category);

  if (distanceMetres === SEVEN_POINT_FIVE_KM) {
    const lowerIndex = tableIndexFor(FOUR_MILES);
    const upperIndex = tableIndexFor(EIGHT_KM);
    const openStandard = interpolate(
      openStandards[lowerIndex] as number,
      openStandards[upperIndex] as number,
      RUNBUNDLE_7_5_KM_WEIGHT,
    );
    const ageFactor = interpolate(
      factorRow[lowerIndex] as number,
      factorRow[upperIndex] as number,
      RUNBUNDLE_7_5_KM_WEIGHT,
    );
    return openStandard / ageFactor;
  }

  const index = tableIndexFor(distanceMetres);
  return (openStandards[index] as number) / (factorRow[index] as number);
}

export interface AgeGradeInput {
  readonly category: ScoringCategory;
  readonly dateOfBirth: Date;
  readonly eventDate: Date;
  readonly distanceMetres: number;
  readonly elapsedMilliseconds: number;
}

export interface AgeGradeOutcome {
  /** Unrounded percentage. Rank and compare on this, never on the display value. */
  readonly percent: number;
  /** Percentage rounded to two decimal places, for display only. */
  readonly displayPercent: number;
  readonly ageOnEventDate: number;
  readonly standardSeconds: number;
  readonly actualSeconds: number;
  readonly version: string;
}

/**
 * `standard / actual * 100`. A runner matching the standard scores 100%.
 *
 * Full precision is retained on `percent` because improvement points are ranked
 * on the difference between two of these values; rounding first would create
 * artificial ties.
 */
export function calculateAgeGrade(input: AgeGradeInput): AgeGradeOutcome {
  if (!Number.isFinite(input.elapsedMilliseconds) || input.elapsedMilliseconds <= 0) {
    throw new AgeGradeError(
      'INVALID_TIME',
      'Elapsed time must be a positive number of milliseconds.',
    );
  }
  if (!isSupportedDistance(input.distanceMetres)) {
    throw new AgeGradeError(
      'UNSUPPORTED_DISTANCE',
      `${input.distanceMetres} m is not a distance this club races.`,
    );
  }

  const age = ageOnDate(input.dateOfBirth, input.eventDate);
  const standardSeconds = ageStandardSeconds(input.category, age, input.distanceMetres);
  const actualSeconds = input.elapsedMilliseconds / 1000;
  const percent = (standardSeconds / actualSeconds) * 100;

  return {
    percent,
    displayPercent: roundToTwoDecimals(percent),
    ageOnEventDate: age,
    standardSeconds,
    actualSeconds,
    version: AGE_GRADE_VERSION,
  };
}

/**
 * Half-up rounding to two decimals.
 *
 * `Number.prototype.toFixed` rounds half-to-even for some binary
 * representations, which makes published percentages disagree with the club's
 * spreadsheet. The epsilon nudge keeps values such as 74.125 rounding to 74.13.
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
}
