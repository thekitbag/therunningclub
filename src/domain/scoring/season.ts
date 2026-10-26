import { rankByCompetition } from './ranking';
import {
  scoreRound,
  type PriorResultInput,
  type RoundEntryInput,
  type RoundScoring,
  type ScoredResult,
  type ScoringProblem,
} from './time-trial';
import {
  COUNTING_ROUNDS,
  ROUNDS_PER_SEASON,
  SCORING_RULES_VERSION,
  type ScoringCategory,
  type SeasonDistances,
  type TimeTrialPointsMode,
} from './types';

export interface SeasonRoundInput {
  readonly roundId: string;
  readonly ordinal: number;
  readonly date: Date;
  /**
   * Only published rounds contribute to public standings and to the improvement
   * chain. Draft rounds are still scored so administrators can preview them.
   */
  readonly published: boolean;
  readonly entries: readonly RoundEntryInput[];
}

export interface SeasonScoringInput {
  /** Authoritative distance snapshot stored on the season. */
  readonly distances: SeasonDistances;
  /** Snapshotted points method for this season. */
  readonly pointsMode: TimeTrialPointsMode;
  readonly rounds: readonly SeasonRoundInput[];
  /** Published history and opening baselines from before this season. */
  readonly priorResults?: readonly PriorResultInput[];
  /** Restrict the improvement chain and standings to published rounds. */
  readonly publishedOnly: boolean;
}

export interface SeasonRoundScoring extends RoundScoring {
  readonly roundId: string;
  readonly date: Date;
  readonly published: boolean;
}

export interface SeasonStandingRound {
  readonly roundId: string;
  readonly ordinal: number;
  /** Null means the runner did not record a result — never conflate with zero. */
  readonly total: number | null;
  readonly appearancePoints: number | null;
  readonly improvementPoints: number | null;
  /** Whole round in traditional modes; improvement component in attendance mode. */
  readonly counts: boolean;
}

export interface SeasonStanding {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  readonly position: number;
  readonly tied: boolean;
  readonly rounds: readonly SeasonStandingRound[];
  readonly roundsCompleted: number;
  /** All appearance points in attendance mode; zero in traditional modes. */
  readonly appearancePointsTotal: number;
  /** Best-four improvement subtotal in attendance mode. */
  readonly improvementPointsTotal: number;
  /** Best four round totals, or all appearances plus best-four improvements. */
  readonly seasonTotal: number;
}

export interface SeasonScoring {
  readonly rounds: readonly SeasonRoundScoring[];
  readonly standings: Readonly<Record<ScoringCategory, readonly SeasonStanding[]>>;
  readonly problems: readonly (ScoringProblem & { roundId: string })[];
  readonly pointsMode: TimeTrialPointsMode;
  readonly scoringRulesVersion: string;
}

/**
 * Scores a whole season from raw inputs.
 *
 * Rounds are processed in chronological order and each one's results are fed
 * forward as prior comparables for the next. Ordinal makes same-date output
 * deterministic, although results on the same calendar date do not compare
 * with one another. That ordering is the entire reason editing a
 * historical time correctly changes later improvement points: there is no
 * cached intermediate state to go stale, only a replay of the same pure
 * function over the corrected inputs.
 */
export function scoreSeason(input: SeasonScoringInput): SeasonScoring {
  const ordered = [...input.rounds].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.ordinal - b.ordinal,
  );
  const scoredRounds: SeasonRoundScoring[] = [];
  const problems: (ScoringProblem & { roundId: string })[] = [];
  const priorResults: PriorResultInput[] = [...(input.priorResults ?? [])];
  const allAppearanceCounts = new Map<string, number>();
  const publishedAppearanceCounts = new Map<string, number>();

  for (const round of ordered) {
    if (input.publishedOnly && !round.published) continue;

    const appearanceCounts = round.published ? publishedAppearanceCounts : allAppearanceCounts;
    const appearanceNumberByRunner = Object.fromEntries(
      round.entries.map((entry) => [
        entry.runnerId,
        (appearanceCounts.get(entry.runnerId) ?? 0) + 1,
      ]),
    );

    const scoring = scoreRound({
      distances: input.distances,
      pointsMode: input.pointsMode,
      appearanceNumberByRunner,
      roundOrdinal: round.ordinal,
      roundDate: round.date,
      entries: round.entries,
      priorResults,
    });

    scoredRounds.push({
      ...scoring,
      roundId: round.roundId,
      date: round.date,
      published: round.published,
    });
    for (const problem of scoring.problems) {
      problems.push({ ...problem, roundId: round.roundId });
    }

    for (const result of scoring.results) {
      allAppearanceCounts.set(result.runnerId, (allAppearanceCounts.get(result.runnerId) ?? 0) + 1);
      if (round.published) {
        publishedAppearanceCounts.set(
          result.runnerId,
          (publishedAppearanceCounts.get(result.runnerId) ?? 0) + 1,
        );
      }
    }

    // Only a published round becomes a comparable for later improvement
    // calculations, so previewing a draft never disturbs published history.
    if (round.published) {
      for (const result of scoring.results) {
        if (result.ageGradePercent === null) continue;
        priorResults.push({
          runnerId: result.runnerId,
          occurredOn: round.date,
          roundOrdinal: round.ordinal,
          resultId: result.resultId ?? undefined,
          ageGradePercent: result.ageGradePercent,
        });
      }
    }
  }

  return {
    rounds: scoredRounds,
    standings: buildStandings(scoredRounds, input.pointsMode),
    problems,
    pointsMode: input.pointsMode,
    scoringRulesVersion: SCORING_RULES_VERSION,
  };
}

/**
 * Builds the season leaderboards.
 *
 * Male and female tables are separate *views* of points that were already
 * calculated from the season's configured pools — filtering here never re-runs
 * the scoring.
 */
export function buildStandings(
  rounds: readonly SeasonRoundScoring[],
  pointsMode: TimeTrialPointsMode = 'FINISHING_AND_IMPROVEMENT',
): Record<ScoringCategory, SeasonStanding[]> {
  const contributing = rounds.filter((round) => round.published);

  interface Accumulator {
    runnerId: string;
    category: ScoringCategory;
    byRound: Map<
      string,
      { ordinal: number; total: number; appearancePoints: number; improvementPoints: number }
    >;
  }

  const byRunner = new Map<string, Accumulator>();
  for (const round of contributing) {
    for (const result of round.results) {
      let accumulator = byRunner.get(result.runnerId);
      if (!accumulator) {
        accumulator = { runnerId: result.runnerId, category: result.category, byRound: new Map() };
        byRunner.set(result.runnerId, accumulator);
      }
      // A runner's category is a property of the runner, so the latest round
      // wins if an administrator corrected it mid-season.
      accumulator.category = result.category;
      accumulator.byRound.set(round.roundId, {
        ordinal: round.roundOrdinal,
        total: result.roundTotal,
        appearancePoints: result.appearancePoints,
        improvementPoints: result.improvementPoints,
      });
    }
  }

  const roundOrder = [...contributing].sort((a, b) => a.roundOrdinal - b.roundOrdinal);

  const unranked = [...byRunner.values()].map((accumulator) => {
    const totals = [...accumulator.byRound.values()];

    const attendanceMode = pointsMode === 'ATTENDANCE_AND_IMPROVEMENT';
    // Traditional modes choose the best four whole round totals. Attendance
    // mode keeps every appearance point but only the four best improvement
    // scores, so neither component accidentally changes the other's purpose.
    const countingTotals = attendanceMode
      ? [...totals]
          .sort((a, b) => b.improvementPoints - a.improvementPoints || a.ordinal - b.ordinal)
          .slice(0, COUNTING_ROUNDS)
      : [...totals]
          .sort((a, b) => b.total - a.total || a.ordinal - b.ordinal)
          .slice(0, COUNTING_ROUNDS);
    const countingRoundOrdinals = new Set(countingTotals.map((entry) => entry.ordinal));
    const appearancePointsTotal = attendanceMode
      ? totals.reduce((sum, entry) => sum + entry.appearancePoints, 0)
      : 0;
    const improvementPointsTotal = attendanceMode
      ? countingTotals.reduce((sum, entry) => sum + entry.improvementPoints, 0)
      : 0;
    const seasonTotal = attendanceMode
      ? appearancePointsTotal + improvementPointsTotal
      : countingTotals.reduce((sum, entry) => sum + entry.total, 0);

    const roundCells: SeasonStandingRound[] = roundOrder.map((round) => {
      const entry = accumulator.byRound.get(round.roundId);
      return {
        roundId: round.roundId,
        ordinal: round.roundOrdinal,
        total: entry ? entry.total : null,
        appearancePoints: entry ? entry.appearancePoints : null,
        improvementPoints: entry ? entry.improvementPoints : null,
        counts: entry ? countingRoundOrdinals.has(entry.ordinal) : false,
      };
    });

    return {
      runnerId: accumulator.runnerId,
      category: accumulator.category,
      rounds: roundCells,
      roundsCompleted: totals.length,
      appearancePointsTotal,
      improvementPointsTotal,
      seasonTotal,
    };
  });

  const standings: Record<ScoringCategory, SeasonStanding[]> = { MALE: [], FEMALE: [] };

  for (const category of ['MALE', 'FEMALE'] as const) {
    const inCategory = unranked.filter((entry) => entry.category === category);
    // Highest applicable season total leads. Equal totals stay tied: v1 has no
    // secondary tie-break, so runs completed is shown but never sorts.
    const ranked = rankByCompetition(inCategory, (a, b) => b.seasonTotal - a.seasonTotal);
    standings[category] = ranked.map(({ item, position, tied }) => ({
      ...item,
      position,
      tied,
    }));
  }

  return standings;
}

/** Age-grade progression for one runner across a season, for the chart view. */
export interface ProgressionPoint {
  readonly roundId: string;
  readonly ordinal: number;
  readonly date: Date;
  readonly ageGradePercent: number | null;
}

export function buildProgression(
  rounds: readonly SeasonRoundScoring[],
  runnerId: string,
): ProgressionPoint[] {
  return [...rounds]
    .filter((round) => round.published)
    .sort((a, b) => a.roundOrdinal - b.roundOrdinal)
    .map((round) => {
      const result = round.results.find((entry) => entry.runnerId === runnerId);
      return {
        roundId: round.roundId,
        ordinal: round.roundOrdinal,
        date: round.date,
        ageGradePercent: result?.ageGradePercent ?? null,
      };
    });
}

export { ROUNDS_PER_SEASON, COUNTING_ROUNDS };
export type { ScoredResult };
