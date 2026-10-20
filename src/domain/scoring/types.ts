/**
 * Shared vocabulary for the scoring domain.
 *
 * Everything in `src/domain/scoring` is framework-independent: no Prisma types,
 * no React, no environment access. The domain consumes plain values and returns
 * results plus an explainable trace, so every rule in `scoring-rules.md` can be
 * exercised without a database or a Next.js server.
 */

/** The two categories the vendored age-grade tables provide standards for. */
export type ScoringCategory = 'MALE' | 'FEMALE';

/** Which lap option a runner took in a time-trial round. */
export type DistanceChoice = 'TWO_LAP' | 'THREE_LAP';

/** Season flavour. Determines the default months and the two lap distances. */
export type SeasonType = 'SUMMER' | 'WINTER';

/**
 * Identifier for the scoring rules themselves, stored next to every derived
 * value. A rules change bumps this and becomes a deliberate migration; a season
 * never mixes versions.
 *
 * V2 raised the club championship from six qualifying races counting six scores
 * to seven counting seven. The club chose to apply that to past years as well,
 * so historical standings were recalculated under V2 rather than left under the
 * rule they were originally run to. The version stored on each record is what
 * makes that decision auditable afterwards.
 */
/**
 * V3 replaced both points ladders with the club's own scoring, taken from the
 * committee's workbook rather than inferred: finishing points are sized by the
 * larger distance field instead of a fixed top of 10, and improvement points by
 * how many runners had a comparable earlier result instead of by how many
 * improved. Stored on every result so a rescore is a deliberate migration.
 */
/**
 * V4 makes the measured summer course distances authoritative: 3.68 miles
 * (5,922 m) for two laps and 4.95 miles (7,966 m) for three. Scoring consumes
 * each season's stored snapshot so historical migrations are deliberate.
 */
export const SCORING_RULES_VERSION = 'RMPAC_SCORING_V5';

/** Rounds in a time-trial season. Fixed by the club's competition format. */
export const ROUNDS_PER_SEASON = 6;

/** How many round totals count towards the season leaderboard. */
export const COUNTING_ROUNDS = 4;

/**
 * Qualifying races needed before a runner enters the championship standings.
 *
 * Raised from six to seven for the 2026 season, and applied to every year — see
 * the note on `SCORING_RULES_VERSION`.
 */
export const CHAMPIONSHIP_QUALIFYING_RACES = 7;

/**
 * How many race scores count towards the championship total.
 *
 * Equal to the qualifying threshold, so a runner has no drop score until they
 * run an eighth race. Both numbers are rendered into the public explanations
 * rather than written out as words, so changing them here changes the copy too.
 */
export const CHAMPIONSHIP_COUNTING_RACES = 7;

export type SeasonDistances = Readonly<Record<DistanceChoice, number>>;

/** Official lap distances in whole metres, per season type. */
export const SEASON_DISTANCES: Readonly<Record<SeasonType, SeasonDistances>> = {
  WINTER: { TWO_LAP: 5000, THREE_LAP: 7500 },
  // Club-measured as 3.68 miles and 4.95 miles respectively. Whole metres are
  // the persistence unit and preserve RunBundle's displayed two-decimal result.
  SUMMER: { TWO_LAP: 5922, THREE_LAP: 7966 },
};

/** Calendar months (1-12) each season type normally spans. */
export const SEASON_MONTHS: Readonly<Record<SeasonType, readonly number[]>> = {
  WINTER: [10, 11, 12, 1, 2, 3],
  SUMMER: [4, 5, 6, 7, 8, 9],
};

export function distanceMetresFor(seasonType: SeasonType, choice: DistanceChoice): number {
  return SEASON_DISTANCES[seasonType][choice];
}

/** Human label for a lap choice, e.g. "Two laps (5 km)". */
export function distanceLabel(seasonType: SeasonType, choice: DistanceChoice): string {
  const metres = distanceMetresFor(seasonType, choice);
  const laps = choice === 'TWO_LAP' ? 'Two laps' : 'Three laps';
  return `${laps} (${formatKilometres(metres)})`;
}

export function formatKilometres(metres: number): string {
  const km = metres / 1000;
  const digits = Number.isInteger(km) ? 0 : metres % 100 === 0 ? 1 : 3;
  return `${km.toFixed(digits)} km`;
}
