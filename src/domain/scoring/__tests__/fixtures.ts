import { calculateAgeGrade } from '../age-grade';
import type { DistanceChoice, ScoringCategory } from '../types';
import type { PriorResultInput, RoundEntryInput } from '../time-trial';

export const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Minutes and seconds to milliseconds, for readable fixture times. */
export const mmss = (minutes: number, seconds: number) => (minutes * 60 + seconds) * 1000;

export interface FixtureRunner {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  readonly dateOfBirth: Date;
}

export function entry(
  runner: FixtureRunner,
  distanceChoice: DistanceChoice,
  elapsedMilliseconds: number,
): RoundEntryInput {
  return {
    runnerId: runner.runnerId,
    category: runner.category,
    dateOfBirth: runner.dateOfBirth,
    distanceChoice,
    elapsedMilliseconds,
  };
}

/**
 * Builds a prior result that is exactly `improvement` percentage points *worse*
 * than what the entry will score in the round being tested.
 *
 * Fixtures need to target specific improvements (the reference round has ten of
 * them, from 9.63 down to 0.56) without inventing plausible-looking times that
 * happen to produce them. Working backwards from the real age-grade calculation
 * keeps the engine under test while making the expected output exact.
 */
export function priorForImprovement(
  input: RoundEntryInput,
  seasonType: 'SUMMER' | 'WINTER',
  roundDate: Date,
  improvement: number,
  roundOrdinal = 1,
): PriorResultInput {
  const distanceMetres =
    seasonType === 'WINTER'
      ? input.distanceChoice === 'TWO_LAP'
        ? 5000
        : 7500
      : input.distanceChoice === 'TWO_LAP'
        ? 6000
        : 8000;

  const current = calculateAgeGrade({
    category: input.category,
    dateOfBirth: input.dateOfBirth,
    eventDate: roundDate,
    distanceMetres,
    elapsedMilliseconds: input.elapsedMilliseconds,
  });

  return {
    runnerId: input.runnerId,
    distanceChoice: input.distanceChoice,
    roundOrdinal,
    ageGradePercent: current.percent - improvement,
  };
}
