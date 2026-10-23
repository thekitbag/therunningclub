import { AgeGradeError, calculateAgeGrade, roundToTwoDecimals } from './age-grade';
import { rankByCompetition } from './ranking';
import {
  SCORING_RULES_VERSION,
  type DistanceChoice,
  type ScoringCategory,
  type SeasonDistances,
  type TimeTrialPointsMode,
} from './types';

/**
 * Two improvements computed from different inputs can land on the same real
 * number yet differ in the last bit of their binary representation. Treating
 * differences below this threshold as equal keeps genuine ties tied without
 * merging runners who are actually a ten-thousandth of a percent apart.
 */
const IMPROVEMENT_TIE_EPSILON = 1e-9;

/**
 * Finishing points are not a fixed ladder.
 *
 * The club scores a round from the size of its LARGER distance field: the
 * winner of each distance takes that number of points and every place below
 * takes one fewer, down to 1 for the last finisher in the larger field. Both
 * distances share the one ladder, so a small three-lap field is not penalised
 * for being small — its winner scores the same as the two-lap winner.
 *
 * Verified against the club's own workbook ("2026 Summer Time Trial.xlsx"),
 * where this reproduces all 81 finishing scores across the six 2026 rounds.
 */
export function winnerFinishingPoints(twoLapFinishers: number, threeLapFinishers: number): number {
  return Math.max(twoLapFinishers, threeLapFinishers);
}

export interface RoundEntryInput {
  /** Present for persisted results so later comparisons can retain provenance. */
  readonly resultId?: string;
  readonly runnerId: string;
  readonly category: ScoringCategory;
  /** Private. Used only to derive the age standard; never leaves the domain. */
  readonly dateOfBirth: Date;
  readonly distanceChoice: DistanceChoice;
  readonly elapsedMilliseconds: number;
}

/** An earlier age grade, from a published result or historical opening baseline. */
export interface PriorResultInput {
  readonly runnerId: string;
  readonly occurredOn: Date;
  /** Null for an imported opening baseline rather than an app-managed result. */
  readonly roundOrdinal: number | null;
  readonly resultId?: string;
  readonly ageGradePercent: number;
}

export interface RoundScoringInput {
  /** Authoritative distance snapshot stored on the season. */
  readonly distances: SeasonDistances;
  /** Which point components this season awards. */
  readonly pointsMode: TimeTrialPointsMode;
  /** This runner's 1-based appearance number in the current season. */
  readonly appearanceNumberByRunner?: Readonly<Record<string, number>>;
  readonly roundOrdinal: number;
  readonly roundDate: Date;
  readonly entries: readonly RoundEntryInput[];
  /** Earlier published results and opening baselines, in any order. */
  readonly priorResults: readonly PriorResultInput[];
}

export type ScoringProblemCode = 'AGE_OUT_OF_RANGE' | 'UNSUPPORTED_DISTANCE' | 'INVALID_TIME';

export interface ScoringProblem {
  readonly runnerId: string;
  readonly code: ScoringProblemCode;
  readonly message: string;
}

export interface ScoredResult {
  readonly resultId: string | null;
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

  /** The runner's most recent earlier age grade, regardless of season or course. */
  readonly previousAgeGradePercent: number | null;
  readonly previousResultId: string | null;
  readonly previousRoundOrdinal: number | null;

  /** Signed change in age grade. Null without a comparable previous result. */
  readonly improvement: number | null;
  readonly improvementDisplay: number | null;
  /** Position in the combined improvement ranking; null when not improving. */
  readonly improvementPosition: number | null;
  readonly improvementPoints: number;

  /** 1 through 6 for successive appearances in an attendance-scored season. */
  readonly appearancePoints: number;

  readonly roundTotal: number;
}

export interface RoundScoring {
  readonly roundOrdinal: number;
  readonly pointsMode: TimeTrialPointsMode;
  readonly results: readonly ScoredResult[];
  readonly problems: readonly ScoringProblem[];
  /** Count of runners with a strictly positive improvement this round. */
  readonly improverCount: number;
  readonly scoringRulesVersion: string;
}

/**
 * Scores one time-trial round.
 *
 * Two independent rankings are calculated:
 *
 *  1. Finish position ranks by elapsed time *within each distance* but *across*
 *     categories, because the club runs one mixed field per lap option. In a
 *     combined season, the points ladder is sized by the LARGER of the two
 *     fields, so the winner of each distance takes that many points and every
 *     place steps down by one. An improvement-only season retains the position
 *     but awards zero finishing points.
 *  2. Improvement points rank every positive age-grade improvement in one pool
 *     spanning both distances and both categories. The ladder is sized by the
 *     number of runners who actually improved, so the largest improvement
 *     takes that many points.
 *  3. Attendance-and-improvement seasons award each runner their 1-based
 *     appearance number in the season. Other modes award zero appearance
 *     points.
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
    appearancePoints: number;
  }

  const working: Working[] = input.entries.map((entry) => {
    const distanceMetres = input.distances[entry.distanceChoice];
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
      appearancePoints:
        input.pointsMode === 'ATTENDANCE_AND_IMPROVEMENT'
          ? Math.max(1, input.appearanceNumberByRunner?.[entry.runnerId] ?? 1)
          : 0,
    };
  });

  // --- Finishing points, ranked separately per distance --------------------
  //
  // The ladder is shared: both distances count down from the size of the larger
  // field, so the top score is the same whichever distance a runner chose.
  const twoLapCount = working.filter((w) => w.entry.distanceChoice === 'TWO_LAP').length;
  const threeLapCount = working.filter((w) => w.entry.distanceChoice === 'THREE_LAP').length;
  const winnerPoints = winnerFinishingPoints(twoLapCount, threeLapCount);

  for (const choice of ['TWO_LAP', 'THREE_LAP'] as const) {
    const inDistance = working.filter((w) => w.entry.distanceChoice === choice);
    const ranked = rankByCompetition(
      inDistance,
      (a, b) => a.entry.elapsedMilliseconds - b.entry.elapsedMilliseconds,
    );

    // Ties keep competition ranking, so a dead heat consumes both places and
    // the next runner skips one: the published winter round of 24 March 2026
    // scores 6, 6, 4 for a tie at fifth. The summer workbook's single tie is
    // scored 12, 12, 11 instead, which is recorded as an open question in
    // docs/scoring-rules-2026.md rather than silently followed.
    for (const { item, position, tied } of ranked) {
      item.finishingPosition = position;
      item.finishingPoints =
        input.pointsMode === 'FINISHING_AND_IMPROVEMENT'
          ? Math.max(winnerPoints + 1 - position, 0)
          : 0;
      item.tiedOnTime = tied;
    }
  }

  // --- Improvement, ranked across both distances and both categories -------
  const priorIndex = indexPriorResults(input.priorResults, input.roundDate);

  for (const w of working) {
    const previous = priorIndex.get(w.entry.runnerId) ?? null;
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
    // Only positive improvements form the ladder. Runners whose age grade was
    // unchanged or went backwards neither score nor inflate another runner's
    // award. Competition ranking preserves ties and skips the following place.
    item.improvementPoints = Math.max(improverCount + 1 - position, 0);
  }

  const results: ScoredResult[] = working.map((w) => ({
    resultId: w.entry.resultId ?? null,
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
    appearancePoints: w.appearancePoints,
    roundTotal: roundTotal(input.pointsMode, w),
  }));

  return {
    roundOrdinal: input.roundOrdinal,
    pointsMode: input.pointsMode,
    results,
    problems,
    improverCount,
    scoringRulesVersion: SCORING_RULES_VERSION,
  };
}

function roundTotal(
  pointsMode: TimeTrialPointsMode,
  result: {
    readonly finishingPoints: number;
    readonly improvementPoints: number;
    readonly appearancePoints: number;
  },
): number {
  switch (pointsMode) {
    case 'FINISHING_AND_IMPROVEMENT':
      return result.finishingPoints + result.improvementPoints;
    case 'IMPROVEMENT_ONLY':
      return result.improvementPoints;
    case 'ATTENDANCE_AND_IMPROVEMENT':
      return result.appearancePoints + result.improvementPoints;
  }
}

/**
 * Picks each runner's latest age grade strictly before the round being scored.
 *
 * Age grades make performances comparable across course choices and seasons, so
 * neither a distance switch nor a season boundary resets the chain.
 */
function indexPriorResults(
  priorResults: readonly PriorResultInput[],
  currentDate: Date,
): Map<string, PriorResultInput> {
  const index = new Map<string, PriorResultInput>();
  for (const prior of priorResults) {
    if (prior.occurredOn.getTime() >= currentDate.getTime()) continue;
    const existing = index.get(prior.runnerId);
    if (!existing || prior.occurredOn.getTime() > existing.occurredOn.getTime()) {
      index.set(prior.runnerId, prior);
    }
  }
  return index;
}
