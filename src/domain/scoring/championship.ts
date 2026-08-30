import { rankByCompetition } from './ranking';
import {
  CHAMPIONSHIP_COUNTING_RACES,
  CHAMPIONSHIP_QUALIFYING_RACES,
  SCORING_RULES_VERSION,
  type ScoringCategory,
} from './types';

/**
 * Club championship scoring.
 *
 * The championship is a *low score wins* competition: the first RMPAC finisher
 * in a category scores 1, the second scores 2, and a runner's total is the sum
 * of their lowest `CHAMPIONSHIP_COUNTING_RACES` scores. That inversion is the
 * main thing to keep in mind when reading this file — "better" means smaller
 * everywhere below.
 */

export interface ChampionshipRaceInput {
  readonly raceId: string;
  readonly shortLabel: string;
  readonly name: string;
  readonly date: Date;
  readonly published: boolean;
}

export interface ChampionshipEntryInput {
  readonly raceId: string;
  readonly runnerId: string;
  readonly category: ScoringCategory;
  /**
   * The runner's position among RMPAC finishers of their own category.
   *
   * Administrators enter this directly: the club never needs the full external
   * race field, only where its own members placed relative to each other.
   */
  readonly categoryPosition: number;
}

export interface ChampionshipScoringInput {
  readonly year: number;
  readonly races: readonly ChampionshipRaceInput[];
  readonly entries: readonly ChampionshipEntryInput[];
  readonly publishedOnly: boolean;
}

export interface ChampionshipRaceScore {
  readonly raceId: string;
  readonly shortLabel: string;
  /** Null means the runner did not contest the race — not a zero score. */
  readonly score: number | null;
  /** True when this score is one of the lowest that count towards the total. */
  readonly counts: boolean;
  readonly tied: boolean;
}

export interface ChampionshipStanding {
  readonly runnerId: string;
  readonly category: ScoringCategory;
  /** Only eligible runners take a position; others are listed after them. */
  readonly position: number | null;
  readonly tied: boolean;
  readonly eligible: boolean;
  readonly racesCompleted: number;
  readonly racesRequired: number;
  /** Sum of the six lowest scores. Null until the runner is eligible. */
  readonly countingTotal: number | null;
  readonly races: readonly ChampionshipRaceScore[];
}

export interface ChampionshipScoring {
  readonly year: number;
  readonly races: readonly ChampionshipRaceInput[];
  readonly standings: Readonly<Record<ScoringCategory, readonly ChampionshipStanding[]>>;
  readonly scoringRulesVersion: string;
}

/**
 * Derives race scores and championship standings.
 *
 * Scores come straight from the administrator-entered category position, which
 * is already a competition rank: if two members dead-heat, the administrator
 * records the same position for both and the next member's position skips a
 * place, exactly as it would in the club's spreadsheet.
 */
export function scoreChampionship(input: ChampionshipScoringInput): ChampionshipScoring {
  const races = input.races
    .filter((race) => !input.publishedOnly || race.published)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const raceIds = new Set(races.map((race) => race.raceId));

  const entries = input.entries.filter((entry) => raceIds.has(entry.raceId));

  interface Accumulator {
    runnerId: string;
    category: ScoringCategory;
    scores: Map<string, { score: number; tied: boolean }>;
  }

  const byRunner = new Map<string, Accumulator>();

  // Detect ties per race and category so the table can mark shared placings.
  const tieKeys = new Set<string>();
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.raceId}::${entry.category}::${entry.categoryPosition}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) tieKeys.add(key);
  }

  for (const entry of entries) {
    let accumulator = byRunner.get(entry.runnerId);
    if (!accumulator) {
      accumulator = { runnerId: entry.runnerId, category: entry.category, scores: new Map() };
      byRunner.set(entry.runnerId, accumulator);
    }
    accumulator.category = entry.category;
    const key = `${entry.raceId}::${entry.category}::${entry.categoryPosition}`;
    accumulator.scores.set(entry.raceId, {
      // First RMPAC finisher scores 1, second scores 2, and so on.
      score: entry.categoryPosition,
      tied: tieKeys.has(key),
    });
  }

  const unranked = [...byRunner.values()].map((accumulator) => {
    const scored = races
      .map((race) => ({ race, entry: accumulator.scores.get(race.raceId) }))
      .filter(
        (pair): pair is { race: ChampionshipRaceInput; entry: { score: number; tied: boolean } } =>
          pair.entry !== undefined,
      );

    const racesCompleted = scored.length;
    const eligible = racesCompleted >= CHAMPIONSHIP_QUALIFYING_RACES;

    // Lowest scores count. Ties in value break by earliest race so the
    // highlighted set does not shuffle between recalculations.
    const countingRaceIds = new Set(
      [...scored]
        .sort(
          (a, b) => a.entry.score - b.entry.score || a.race.date.getTime() - b.race.date.getTime(),
        )
        .slice(0, CHAMPIONSHIP_COUNTING_RACES)
        .map((pair) => pair.race.raceId),
    );

    const countingTotal = eligible
      ? [...scored]
          .sort(
            (a, b) =>
              a.entry.score - b.entry.score || a.race.date.getTime() - b.race.date.getTime(),
          )
          .slice(0, CHAMPIONSHIP_COUNTING_RACES)
          .reduce((sum, pair) => sum + pair.entry.score, 0)
      : null;

    const raceCells: ChampionshipRaceScore[] = races.map((race) => {
      const entry = accumulator.scores.get(race.raceId);
      return {
        raceId: race.raceId,
        shortLabel: race.shortLabel,
        score: entry ? entry.score : null,
        // Only an eligible runner has a total, so only an eligible runner has
        // scores that count towards one. Highlighting cells for someone with
        // four races would imply a best-six total they do not yet have.
        counts: entry ? eligible && countingRaceIds.has(race.raceId) : false,
        tied: entry ? entry.tied : false,
      };
    });

    return {
      runnerId: accumulator.runnerId,
      category: accumulator.category,
      eligible,
      racesCompleted,
      racesRequired: CHAMPIONSHIP_QUALIFYING_RACES,
      countingTotal,
      races: raceCells,
    };
  });

  const standings: Record<ScoringCategory, ChampionshipStanding[]> = { MALE: [], FEMALE: [] };

  for (const category of ['MALE', 'FEMALE'] as const) {
    const inCategory = unranked.filter((entry) => entry.category === category);
    const eligible = inCategory.filter((entry) => entry.eligible);
    const notYetEligible = inCategory.filter((entry) => !entry.eligible);

    // Lowest total leads. Equal totals stay tied.
    const ranked = rankByCompetition(
      eligible,
      (a, b) => (a.countingTotal as number) - (b.countingTotal as number),
    );

    standings[category] = [
      ...ranked.map(({ item, position, tied }) => ({ ...item, position, tied })),
      // Runners still working towards six races remain visible, ordered by how
      // close they are, but hold no position.
      ...notYetEligible
        .sort((a, b) => b.racesCompleted - a.racesCompleted)
        .map((item) => ({ ...item, position: null, tied: false })),
    ];
  }

  return {
    year: input.year,
    races,
    standings,
    scoringRulesVersion: SCORING_RULES_VERSION,
  };
}

/** Human-readable eligibility progress, e.g. "4 of 6 races". */
export function eligibilityLabel(standing: ChampionshipStanding): string {
  return standing.eligible
    ? 'Eligible'
    : `Not yet eligible — ${standing.racesCompleted} of ${standing.racesRequired} races`;
}

export { CHAMPIONSHIP_QUALIFYING_RACES, CHAMPIONSHIP_COUNTING_RACES };
