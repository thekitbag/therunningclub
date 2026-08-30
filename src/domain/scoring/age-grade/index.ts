import {
  AGE_STANDARD_DISTANCES_METRES,
  FEMALE_ROAD_STANDARDS_2015,
  MALE_ROAD_STANDARDS_2015,
  MAX_TABLE_AGE,
  MIN_TABLE_AGE,
  type AgeStandardRow,
} from './data/wma-road-2015';
import type { ScoringCategory } from '../types';

/**
 * Identifier for the vendored standards plus the interpolation rules applied on
 * top of them. It is persisted with every calculated result so that adopting a
 * future table edition is a deliberate migration rather than a silent rewrite of
 * published history.
 */
export const AGE_GRADE_VERSION = 'WMA_ROAD_2015_RMPAC_V1';

export { MIN_TABLE_AGE, MAX_TABLE_AGE };

const FIVE_KM = 5000;
const TEN_KM = 10000;

/**
 * `7.5 km` is not a table-native distance. The published methodology
 * interpolates between neighbouring standards on a logarithmic distance scale,
 * which reflects how race pace decays with distance far better than a linear
 * blend would.
 */
const LOG_INTERPOLATION_WEIGHT =
  (Math.log(7500) - Math.log(FIVE_KM)) / (Math.log(TEN_KM) - Math.log(FIVE_KM));

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

function standardsFor(category: ScoringCategory): Readonly<Record<number, AgeStandardRow>> {
  return category === 'MALE' ? MALE_ROAD_STANDARDS_2015 : FEMALE_ROAD_STANDARDS_2015;
}

function tableIndexFor(metres: number): number {
  const index = (AGE_STANDARD_DISTANCES_METRES as readonly number[]).indexOf(metres);
  if (index < 0) {
    throw new AgeGradeError(
      'UNSUPPORTED_DISTANCE',
      `No vendored age standard exists for ${metres} m.`,
    );
  }
  return index;
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
 * The age standard, in seconds, for a category, age and distance.
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
      `Age ${age} is outside the published WMA 2015 road tables (${MIN_TABLE_AGE}-${MAX_TABLE_AGE}).`,
    );
  }

  const table = standardsFor(category);
  const row = table[age];
  /* c8 ignore next 3 -- guarded by the range check above; kept as a hard invariant. */
  if (!row) {
    throw new AgeGradeError('AGE_OUT_OF_RANGE', `No standard row for age ${age}.`);
  }

  if (distanceMetres === 7500) {
    const fiveKm = row[tableIndexFor(FIVE_KM)] as number;
    const tenKm = row[tableIndexFor(TEN_KM)] as number;
    return fiveKm * (1 - LOG_INTERPOLATION_WEIGHT) + tenKm * LOG_INTERPOLATION_WEIGHT;
  }

  return row[tableIndexFor(distanceMetres)] as number;
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
