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
  type SeasonType,
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
  readonly seasonType: SeasonType;
  readonly rounds: readonly SeasonRoundInput[];
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
  /** True when this round is one of the best four that count. */
  readonly counts: boolean;
}

export interface SeasonStanding {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  readonly position: number;
  readonly tied: boolean;
  readonly rounds: readonly SeasonStandingRound[];
  readonly roundsCompleted: number;
  /** Sum of the best four round totals, or of everything run when fewer. */
  readonly bestFourTotal: number;
}

export interface SeasonScoring {
  readonly rounds: readonly SeasonRoundScoring[];
  readonly standings: Readonly<Record<ScoringCategory, readonly SeasonStanding[]>>;
  readonly problems: readonly (ScoringProblem & { roundId: string })[];
  readonly scoringRulesVersion: string;
}

/**
 * Scores a whole season from raw inputs.
 *
 * Rounds are processed in ordinal order and each one's results are fed forward
 * as prior comparables for the next. That ordering is the entire reason editing
 * a historical time correctly changes later improvement points: there is no
 * cached intermediate state to go stale, only a replay of the same pure
 * function over the corrected inputs.
 */
export function scoreSeason(input: SeasonScoringInput): SeasonScoring {
  const ordered = [...input.rounds].sort((a, b) => a.ordinal - b.ordinal);
  const scoredRounds: SeasonRoundScoring[] = [];
  const problems: (ScoringProblem & { roundId: string })[] = [];
  const priorResults: PriorResultInput[] = [];

  for (const round of ordered) {
    if (input.publishedOnly && !round.published) continue;

    const scoring = scoreRound({
      seasonType: input.seasonType,
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

    // Only a published round becomes a comparable for later improvement
    // calculations, so previewing a draft never disturbs published history.
    if (round.published || !input.publishedOnly) {
      for (const result of scoring.results) {
        if (result.ageGradePercent === null) continue;
        priorResults.push({
          runnerId: result.runnerId,
          distanceChoice: result.distanceChoice,
          roundOrdinal: round.ordinal,
          ageGradePercent: result.ageGradePercent,
        });
      }
    }
  }

  return {
    rounds: scoredRounds,
    standings: buildStandings(scoredRounds),
    problems,
    scoringRulesVersion: SCORING_RULES_VERSION,
  };
}

/**
 * Builds the best-four leaderboards.
 *
 * Male and female tables are separate *views* of points that were already
 * calculated from the shared finishing and improvement pools — filtering here
 * never re-runs the scoring.
 */
export function buildStandings(
  rounds: readonly SeasonRoundScoring[],
): Record<ScoringCategory, SeasonStanding[]> {
  const contributing = rounds.filter((round) => round.published);

  interface Accumulator {
    runnerId: string;
    category: ScoringCategory;
    byRound: Map<string, { ordinal: number; total: number }>;
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
      });
    }
  }

  const roundOrder = [...contributing].sort((a, b) => a.roundOrdinal - b.roundOrdinal);

  const unranked = [...byRunner.values()].map((accumulator) => {
    const totals = [...accumulator.byRound.values()];

    // Choose the counting rounds by value, breaking value ties by earliest
    // ordinal so the highlighted set is stable between recalculations.
    const countingRoundOrdinals = new Set(
      [...totals]
        .sort((a, b) => b.total - a.total || a.ordinal - b.ordinal)
        .slice(0, COUNTING_ROUNDS)
        .map((entry) => entry.ordinal),
    );

    const bestFourTotal = [...totals]
      .sort((a, b) => b.total - a.total || a.ordinal - b.ordinal)
      .slice(0, COUNTING_ROUNDS)
      .reduce((sum, entry) => sum + entry.total, 0);

    const roundCells: SeasonStandingRound[] = roundOrder.map((round) => {
      const entry = accumulator.byRound.get(round.roundId);
      return {
        roundId: round.roundId,
        ordinal: round.roundOrdinal,
        total: entry ? entry.total : null,
        counts: entry ? countingRoundOrdinals.has(entry.ordinal) : false,
      };
    });

    return {
      runnerId: accumulator.runnerId,
      category: accumulator.category,
      rounds: roundCells,
      roundsCompleted: totals.length,
      bestFourTotal,
    };
  });

  const standings: Record<ScoringCategory, SeasonStanding[]> = { MALE: [], FEMALE: [] };

  for (const category of ['MALE', 'FEMALE'] as const) {
    const inCategory = unranked.filter((entry) => entry.category === category);
    // Highest best-four total leads. Equal totals stay tied: v1 has no
    // secondary tie-break, so runs completed is shown but never sorts.
    const ranked = rankByCompetition(inCategory, (a, b) => b.bestFourTotal - a.bestFourTotal);
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
