import { describe, expect, it } from 'vitest';
import { scoreRound } from '../time-trial';
import { buildStandings, type SeasonRoundScoring } from '../season';
import { entry, mmss, priorForImprovement, utc, type FixtureRunner } from './fixtures';

/**
 * Golden fixture derived from the published RMPAC winter time-trial round of
 * 24 March 2026 (`references/winter-tt-2025-26.pdf`).
 *
 * Runner names are anonymised, as the specification permits, and dates of birth
 * are invented because the published sheet does not contain them — the numbers
 * under test are the point patterns, not anyone's personal data. Times and
 * birth dates are chosen so the engine's own age-grade calculation reproduces
 * the published improvements exactly; nothing here hardcodes an expected
 * age-grade percentage.
 *
 * Known transcription inconsistency in the source: the improvement cell on the
 * top row appears to read 9, but the row's stated round total of 20 and the ten
 * positive improvements in the field both imply 10. Per the reference-precedence
 * rule the deterministic formula wins, so this fixture asserts 10 and records
 * the discrepancy here rather than encoding the spreadsheet's slip.
 *
 * ---------------------------------------------------------------------------
 * THE PUBLISHED POINTS ON THIS SHEET ARE NO LONGER THE POINTS WE CALCULATE
 * ---------------------------------------------------------------------------
 *
 * Scoring changed between this winter season and summer 2026. The published
 * sheet here awards a fixed ten to each distance winner and sizes improvement
 * points by the number of improvers. The committee's summer 2026 workbook
 * ("2026 Summer Time Trial.xlsx") sizes both ladders by field size instead,
 * which is what `RMPAC_SCORING_V3` implements and what this file now asserts.
 *
 * The published values are kept alongside the current ones so the change stays
 * visible and so this round can be re-checked if the committee confirms a
 * different intent. See docs/scoring-rules-2026.md.
 *
 * The one place the two rule sets are known to disagree beyond the ladder size
 * is a dead heat, and this sheet is the authority we follow: its tie at fifth
 * scores 6, 6, 4 — competition ranking, with the next place skipped.
 */

const ROUND_DATE = utc('2026-03-24');

const runner = (id: string, category: 'MALE' | 'FEMALE', birth: string): FixtureRunner => ({
  runnerId: id,
  category,
  dateOfBirth: utc(birth),
});

// Nine two-lap finishers, in finishing order.
const TWO_LAP = [
  { r: runner('two-1', 'MALE', '1979-04-12'), time: mmss(18, 42) },
  { r: runner('two-2', 'MALE', '1986-09-03'), time: mmss(19, 15) },
  { r: runner('two-3', 'FEMALE', '1990-01-22'), time: mmss(20, 8) },
  { r: runner('two-4', 'MALE', '1972-06-30'), time: mmss(20, 51) },
  { r: runner('two-5', 'FEMALE', '1983-11-14'), time: mmss(21, 33) },
  { r: runner('two-6', 'MALE', '1965-02-08'), time: mmss(22, 19) },
  { r: runner('two-7', 'FEMALE', '1995-07-19'), time: mmss(23, 4) },
  { r: runner('two-8', 'MALE', '1958-10-25'), time: mmss(24, 47) },
  { r: runner('two-9', 'FEMALE', '1969-05-06'), time: mmss(26, 12) },
];

// Five three-lap finishers, in finishing order.
const THREE_LAP = [
  { r: runner('three-1', 'MALE', '1981-08-17'), time: mmss(29, 5) },
  { r: runner('three-2', 'MALE', '1993-03-29'), time: mmss(30, 22) },
  { r: runner('three-3', 'FEMALE', '1987-12-11'), time: mmss(32, 40) },
  { r: runner('three-4', 'MALE', '1962-01-05'), time: mmss(34, 18) },
  { r: runner('three-5', 'FEMALE', '1975-09-23'), time: mmss(36, 55) },
];

/**
 * The ten positive improvements published for the round, largest first, with
 * the improvement points each one earned.
 */
const PUBLISHED_IMPROVEMENTS: ReadonlyArray<{
  runnerId: string;
  improvement: number;
  /** What the winter sheet printed: one point per improver, ten down to one. */
  publishedPoints: number;
  /** What V3 awards: fourteen runners had a comparison, so the ladder tops at 14. */
  points: number;
}> = [
  { runnerId: 'two-1', improvement: 9.63, publishedPoints: 10, points: 14 },
  { runnerId: 'three-1', improvement: 7.18, publishedPoints: 9, points: 13 },
  { runnerId: 'two-3', improvement: 6.02, publishedPoints: 8, points: 12 },
  { runnerId: 'three-2', improvement: 6.01, publishedPoints: 7, points: 11 },
  { runnerId: 'two-2', improvement: 5.06, publishedPoints: 6, points: 10 },
  { runnerId: 'three-3', improvement: 2.68, publishedPoints: 5, points: 9 },
  { runnerId: 'two-5', improvement: 2.01, publishedPoints: 4, points: 8 },
  { runnerId: 'three-4', improvement: 1.88, publishedPoints: 3, points: 7 },
  { runnerId: 'two-4', improvement: 1.05, publishedPoints: 2, points: 6 },
  { runnerId: 'two-7', improvement: 0.56, publishedPoints: 1, points: 5 },
];

const ALL_ENTRIES = [
  ...TWO_LAP.map((f) => entry(f.r, 'TWO_LAP', f.time)),
  ...THREE_LAP.map((f) => entry(f.r, 'THREE_LAP', f.time)),
];

const improvementByRunner = new Map(PUBLISHED_IMPROVEMENTS.map((i) => [i.runnerId, i.improvement]));

const PRIOR_RESULTS = ALL_ENTRIES.map((e) => {
  const improvement = improvementByRunner.get(e.runnerId);
  // Runners without a published improvement ran slower than last time; a
  // negative delta keeps them out of the improvement pool.
  return priorForImprovement(e, 'WINTER', ROUND_DATE, improvement ?? -1.5, 5);
});

const scored = scoreRound({
  seasonType: 'WINTER',
  roundOrdinal: 6,
  roundDate: ROUND_DATE,
  entries: ALL_ENTRIES,
  priorResults: PRIOR_RESULTS,
});

const byId = Object.fromEntries(scored.results.map((r) => [r.runnerId, r]));

describe('golden round: 24 March 2026', () => {
  it('scores every entry without a validation problem', () => {
    expect(scored.problems).toEqual([]);
    expect(scored.results).toHaveLength(14);
  });

  it('sizes the two-lap ladder from the nine-strong field', () => {
    // Published sheet: 10, 9, 8, 7, 6, 5, 4, 3, 2 under the old fixed ladder.
    const points = TWO_LAP.map((f) => byId[f.r.runnerId]?.finishingPoints);
    expect(points).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('gives the five three-lap finishers the same ladder as the larger field', () => {
    // Published sheet: 10, 9, 8, 7, 6. The top score is the larger field's size
    // either way, so the small field is still not penalised for being small.
    const points = THREE_LAP.map((f) => byId[f.r.runnerId]?.finishingPoints);
    expect(points).toEqual([9, 8, 7, 6, 5]);
  });

  it('finds exactly the ten published improvers', () => {
    expect(scored.improverCount).toBe(10);
    const improvers = scored.results
      .filter((r) => r.improvementPoints > 0)
      .map((r) => r.runnerId)
      .sort();
    expect(improvers).toEqual(PUBLISHED_IMPROVEMENTS.map((i) => i.runnerId).sort());
  });

  it('reproduces every published improvement and its points', () => {
    for (const published of PUBLISHED_IMPROVEMENTS) {
      const result = byId[published.runnerId];
      expect(result?.improvementDisplay, published.runnerId).toBeCloseTo(published.improvement, 2);
      expect(result?.improvementPoints, published.runnerId).toBe(published.points);
    }
  });

  it('separates the 6.02 and 6.01 improvements rather than tying them', () => {
    // Only one hundredth apart; rounding before ranking would merge these two
    // and shift every point below them.
    expect(byId['two-3']?.improvementPoints).toBe(12);
    expect(byId['three-2']?.improvementPoints).toBe(11);
  });

  it('produces a highest round total of 23', () => {
    // The published sheet totalled 20 for this row under the old ladders.
    const totals = scored.results.map((r) => r.roundTotal);
    expect(Math.max(...totals)).toBe(23);

    // The top row is both the fastest two-lap runner and the largest improver.
    const top = byId['two-1'];
    expect(top?.finishingPoints).toBe(9);
    expect(top?.improvementPoints).toBe(14);
    expect(top?.roundTotal).toBe(23);
  });

  it('keeps every scoring component an integer', () => {
    for (const result of scored.results) {
      expect(Number.isInteger(result.finishingPoints)).toBe(true);
      expect(Number.isInteger(result.improvementPoints)).toBe(true);
      expect(Number.isInteger(result.roundTotal)).toBe(true);
    }
  });
});

/**
 * Season best-four totals published on the same sheet.
 *
 * These exercise `buildStandings` directly on round totals, which is the level
 * the published season table is calculated at.
 */
describe('golden season best-four totals', () => {
  const roundTotalsFor = (runnerId: string, category: 'MALE' | 'FEMALE', totals: number[]) =>
    totals.map((total, index) => ({
      runnerId,
      category,
      total,
      ordinal: index + 1,
    }));

  function standingsFromTotals(
    rows: ReadonlyArray<{ runnerId: string; category: 'MALE' | 'FEMALE'; totals: number[] }>,
  ) {
    const cells = rows.flatMap((row) => roundTotalsFor(row.runnerId, row.category, row.totals));
    const rounds: SeasonRoundScoring[] = Array.from({ length: 6 }, (_, index) => {
      const ordinal = index + 1;
      return {
        roundId: `round-${ordinal}`,
        roundOrdinal: ordinal,
        date: utc(`2025-1${index}-01`.slice(0, 10)),
        published: true,
        improverCount: 0,
        problems: [],
        scoringRulesVersion: 'RMPAC_SCORING_V1',
        results: cells
          .filter((cell) => cell.ordinal === ordinal)
          .map((cell) => ({
            runnerId: cell.runnerId,
            category: cell.category,
            distanceChoice: 'TWO_LAP' as const,
            distanceMetres: 5000,
            elapsedMilliseconds: 1_200_000,
            finishingPosition: 1,
            finishingPoints: cell.total,
            tiedOnTime: false,
            ageGradePercent: 70,
            ageGradeDisplayPercent: 70,
            ageOnRoundDate: 40,
            previousAgeGradePercent: null,
            previousResultId: null,
            previousRoundOrdinal: null,
            improvement: null,
            improvementDisplay: null,
            improvementPosition: null,
            improvementPoints: 0,
            roundTotal: cell.total,
          })),
      };
    });
    return buildStandings(rounds);
  }

  it('totals the season-leading male row as 68', () => {
    const standings = standingsFromTotals([
      { runnerId: 'leader', category: 'MALE', totals: [16, 15, 17, 13, 20, 11] },
    ]);
    const leader = standings.MALE[0];
    // 20 + 17 + 16 + 15; the 13 and the 11 are dropped.
    expect(leader?.bestFourTotal).toBe(68);
    expect(leader?.roundsCompleted).toBe(6);
    expect(leader?.rounds.filter((r) => r.counts).map((r) => r.total)).toEqual([16, 15, 17, 20]);
  });

  it('totals the leading female row as 62 and counts a zero-score round as run', () => {
    const standings = standingsFromTotals([
      { runnerId: 'leader-f', category: 'FEMALE', totals: [0, 11, 17, 22, 7, 12] },
    ]);
    const leader = standings.FEMALE[0];
    // 22 + 17 + 12 + 11; the 7 and the 0 are dropped, but the 0 still counts as
    // a round completed because she ran it.
    expect(leader?.bestFourTotal).toBe(62);
    expect(leader?.roundsCompleted).toBe(6);
    expect(leader?.rounds[0]?.total).toBe(0);
    expect(leader?.rounds[0]?.counts).toBe(false);
  });

  it('keeps male and female leaderboards separate', () => {
    const standings = standingsFromTotals([
      { runnerId: 'leader', category: 'MALE', totals: [16, 15, 17, 13, 20, 11] },
      { runnerId: 'leader-f', category: 'FEMALE', totals: [0, 11, 17, 22, 7, 12] },
    ]);
    expect(standings.MALE.map((s) => s.runnerId)).toEqual(['leader']);
    expect(standings.FEMALE.map((s) => s.runnerId)).toEqual(['leader-f']);
    // Each leads their own table despite the male total being higher.
    expect(standings.MALE[0]?.position).toBe(1);
    expect(standings.FEMALE[0]?.position).toBe(1);
  });
});
