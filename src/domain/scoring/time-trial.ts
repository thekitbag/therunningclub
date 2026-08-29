import { AgeGradeError, calculateAgeGrade, roundToTwoDecimals } from './age-grade';
import { rankByCompetition } from './ranking';
import {
  SCORING_RULES_VERSION,
  distanceMetresFor,
  type DistanceChoice,
  type ScoringCategory,
  type SeasonType,
} from './types';

/**
 * Two improvements computed from different inputs can land on the same real
 * number yet differ in the last bit of their binary representation. Treating
 * differences below this threshold as equal keeps genuine ties tied without
 * merging runners who are actually a ten-thousandth of a percent apart.
 */
const IMPROVEMENT_TIE_EPSILON = 1e-9;

/** Finishing points awarded to the winner of each distance. */
export const WINNER_FINISHING_POINTS = 10;

export interface RoundEntryInput {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  /** Private. Used only to derive the age standard; never leaves the domain. */
  readonly dateOfBirth: Date;
  readonly distanceChoice: DistanceChoice;
  readonly elapsedMilliseconds: number;
}

/** An earlier published result in the same season, used for improvement. */
export interface PriorResultInput {
  readonly runnerId: string;
  readonly distanceChoice: DistanceChoice;
  /** Round ordinal 1-6. Comparison always looks strictly backwards. */
  readonly roundOrdinal: number;
  readonly resultId?: string;
  readonly ageGradePercent: number;
}

export interface RoundScoringInput {
  readonly seasonType: SeasonType;
  readonly roundOrdinal: number;
  readonly roundDate: Date;
  readonly entries: readonly RoundEntryInput[];
  /** Every published result earlier in this season, in any order. */
  readonly priorResults: readonly PriorResultInput[];
}

export type ScoringProblemCode = 'AGE_OUT_OF_RANGE' | 'UNSUPPORTED_DISTANCE' | 'INVALID_TIME';

export interface ScoringProblem {
  readonly runnerId: string;
  readonly code: ScoringProblemCode;
  readonly message: string;
}

export interface ScoredResult {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  readonly distanceChoice: DistanceChoice;
  readonly distanceMetres: number;
  readonly elapsedMilliseconds: number;

  /** Competition position within this distance, across both categories. */
  readonly finishingPosition: number;
  readonly finishingPoints: number;
  readonly tiedOnTime: boolean;

  /** Null when the runner could not be age-graded; see `problems`. */
  readonly ageGradePercent: number | null;
  readonly ageGradeDisplayPercent: number | null;
  readonly ageOnRoundDate: number | null;

  /** The comparable earlier result in this season at this distance, if any. */
  readonly previousAgeGradePercent: number | null;
  readonly previousResultId: string | null;
  readonly previousRoundOrdinal: number | null;

  /** Signed change in age grade. Null without a comparable previous result. */
  readonly improvement: number | null;
  readonly improvementDisplay: number | null;
  /** Position in the combined improvement ranking; null when not improving. */
  readonly improvementPosition: number | null;
  readonly improvementPoints: number;

  readonly roundTotal: number;
}

export interface RoundScoring {
  readonly roundOrdinal: number;
  readonly results: readonly ScoredResult[];
  readonly problems: readonly ScoringProblem[];
  /** Count of runners with a strictly positive improvement this round. */
  readonly improverCount: number;
  readonly scoringRulesVersion: string;
}

/**
 * Scores one time-trial round.
 *
 * Two independent rankings drive the points:
 *
 *  1. Finishing points rank by elapsed time *within each distance* but *across*
 *     categories, because the club runs one mixed field per lap option. The
 *     winner of each distance takes 10 points down to 1 point for tenth, and
 *     nothing below that.
 *  2. Improvement points rank every positive age-grade improvement in one pool
 *     spanning both distances and both categories. With N improvers the largest
 *     improvement takes N points, descending to 1.
 *
 * Displaying separate male and female tables later is a filter over these
 * numbers, never a recalculation.
 */
export function scoreRound(input: RoundScoringInput): RoundScoring {
  const problems: ScoringProblem[] = [];

  // --- Age grade each entry ------------------------------------------------
  interface Working {
    entry: RoundEntryInput;
    distanceMetres: number;
    ageGradePercent: number | null;
    ageOnRoundDate: number | null;
    previous: PriorResultInput | null;
    improvement: number | null;
    finishingPosition: number;
    finishingPoints: number;
    tiedOnTime: boolean;
    improvementPosition: number | null;
    improvementPoints: number;
  }

  const working: Working[] = input.entries.map((entry) => {
    const distanceMetres = distanceMetresFor(input.seasonType, entry.distanceChoice);
    let ageGradePercent: number | null = null;
    let ageOnRoundDate: number | null = null;

    try {
      const graded = calculateAgeGrade({
        category: entry.category,
        dateOfBirth: entry.dateOfBirth,
        eventDate: input.roundDate,
        distanceMetres,
        elapsedMilliseconds: entry.elapsedMilliseconds,
      });
      ageGradePercent = graded.percent;
      ageOnRoundDate = graded.ageOnEventDate;
    } catch (error) {
      if (error instanceof AgeGradeError) {
        problems.push({ runnerId: entry.runnerId, code: error.code, message: error.message });
      } else {
        throw error;
      }
    }

    return {
      entry,
      distanceMetres,
      ageGradePercent,
      ageOnRoundDate,
      previous: null,
      improvement: null,
      finishingPosition: 0,
      finishingPoints: 0,
      tiedOnTime: false,
      improvementPosition: null,
      improvementPoints: 0,
    };
  });

  // --- Finishing points, ranked separately per distance --------------------
  for (const choice of ['TWO_LAP', 'THREE_LAP'] as const) {
    const inDistance = working.filter((w) => w.entry.distanceChoice === choice);
    const ranked = rankByCompetition(
      inDistance,
      (a, b) => a.entry.elapsedMilliseconds - b.entry.elapsedMilliseconds,
    );
    for (const { item, position, tied } of ranked) {
      item.finishingPosition = position;
      // 1st -> 10 ... 10th -> 1, and nothing from 11th down.
      item.finishingPoints = Math.max(WINNER_FINISHING_POINTS + 1 - position, 0);
      item.tiedOnTime = tied;
    }
  }

  // --- Improvement, ranked across both distances and both categories -------
  const priorIndex = indexPriorResults(input.priorResults, input.roundOrdinal);

  for (const w of working) {
    const key = comparableKey(w.entry.runnerId, w.entry.distanceChoice);
    const previous = priorIndex.get(key) ?? null;
    w.previous = previous;

    if (previous && w.ageGradePercent !== null) {
      w.improvement = w.ageGradePercent - previous.ageGradePercent;
    }
  }

  const improvers = working.filter(
    (w) => w.improvement !== null && w.improvement > IMPROVEMENT_TIE_EPSILON,
  );

  const rankedImprovers = rankByCompetition(improvers, (a, b) => {
    const difference = (b.improvement as number) - (a.improvement as number);
    return Math.abs(difference) <= IMPROVEMENT_TIE_EPSILON ? 0 : difference;
  });

  const improverCount = improvers.length;
  for (const { item, position } of rankedImprovers) {
    item.improvementPosition = position;
    // Largest improvement takes one point per improver, descending by position.
    // Competition ranking makes ties share points and skip the next place, so
    // five improvers ranked 1, 2, 2, 4, 5 score 5, 4, 4, 2, 1.
    item.improvementPoints = Math.max(improverCount + 1 - position, 0);
  }

  const results: ScoredResult[] = working.map((w) => ({
    runnerId: w.entry.runnerId,
    category: w.entry.category,
    distanceChoice: w.entry.distanceChoice,
    distanceMetres: w.distanceMetres,
    elapsedMilliseconds: w.entry.elapsedMilliseconds,
    finishingPosition: w.finishingPosition,
    finishingPoints: w.finishingPoints,
    tiedOnTime: w.tiedOnTime,
    ageGradePercent: w.ageGradePercent,
    ageGradeDisplayPercent:
      w.ageGradePercent === null ? null : roundToTwoDecimals(w.ageGradePercent),
    ageOnRoundDate: w.ageOnRoundDate,
    previousAgeGradePercent: w.previous ? w.previous.ageGradePercent : null,
    previousResultId: w.previous?.resultId ?? null,
    previousRoundOrdinal: w.previous ? w.previous.roundOrdinal : null,
    improvement: w.improvement,
    improvementDisplay: w.improvement === null ? null : roundToTwoDecimals(w.improvement),
    improvementPosition: w.improvementPosition,
    improvementPoints: w.improvementPoints,
    roundTotal: w.finishingPoints + w.improvementPoints,
  }));

  return {
    roundOrdinal: input.roundOrdinal,
    results,
    problems,
    improverCount,
    scoringRulesVersion: SCORING_RULES_VERSION,
  };
}

function comparableKey(runnerId: string, choice: DistanceChoice): string {
  return `${runnerId}::${choice}`;
}

/**
 * Picks, for each runner and distance, the latest result strictly before the
 * round being scored.
 *
 * A runner who misses a round therefore compares against whenever they last ran
 * that distance in the season, not against the immediately preceding round.
 */
function indexPriorResults(
  priorResults: readonly PriorResultInput[],
  currentOrdinal: number,
): Map<string, PriorResultInput> {
  const index = new Map<string, PriorResultInput>();
  for (const prior of priorResults) {
    if (prior.roundOrdinal >= currentOrdinal) continue;
    const key = comparableKey(prior.runnerId, prior.distanceChoice);
    const existing = index.get(key);
    if (!existing || prior.roundOrdinal > existing.roundOrdinal) {
      index.set(key, prior);
    }
  }
  return index;
}
