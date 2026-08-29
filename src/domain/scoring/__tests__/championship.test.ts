import { describe, expect, it } from 'vitest';
import { eligibilityLabel, scoreChampionship } from '../championship';
import type { ChampionshipEntryInput, ChampionshipRaceInput } from '../championship';
import { utc } from './fixtures';

/** Sixteen qualifying races, matching the club's 2025 championship shape. */
const RACE_LABELS = [
  'BSQ',
  'L10',
  'PC10',
  'PCHALF',
  'WB10K',
  'WHALF',
  'YHALF',
  'HHALF',
  'M5',
  'EGE',
  'PTPLOD',
  'PB10',
  'BKMV',
  'MN10',
  'SH',
  'XC',
] as const;

const races: ChampionshipRaceInput[] = RACE_LABELS.map((shortLabel, index) => ({
  raceId: `race-${index + 1}`,
  shortLabel,
  name: `${shortLabel} Race`,
  date: utc(
    `2025-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
  ),
  published: true,
}));

const raceIdAt = (index: number) => `race-${index + 1}`;

/** Places a runner in the first `count` races at the given category position. */
function placings(
  runnerId: string,
  category: 'MALE' | 'FEMALE',
  positions: readonly number[],
  startIndex = 0,
): ChampionshipEntryInput[] {
  return positions.map((categoryPosition, offset) => ({
    raceId: raceIdAt(startIndex + offset),
    runnerId,
    category,
    categoryPosition,
  }));
}

const run = (
  entries: ChampionshipEntryInput[],
  overrides?: Partial<Parameters<typeof scoreChampionship>[0]>,
) =>
  scoreChampionship({
    year: 2025,
    races,
    entries,
    publishedOnly: true,
    ...overrides,
  });

describe('race scores', () => {
  it('scores the first club finisher in a category 1, the second 2, and so on', () => {
    const result = run([
      ...placings('first', 'MALE', [1]),
      ...placings('second', 'MALE', [2]),
      ...placings('third', 'MALE', [3]),
    ]);
    const scores = result.standings.MALE.map((s) => s.races[0]?.score);
    expect(scores).toEqual([1, 2, 3]);
  });

  it('scores male and female categories separately', () => {
    // Both the leading man and the leading woman score 1 in the same race.
    const result = run([...placings('m1', 'MALE', [1]), ...placings('f1', 'FEMALE', [1])]);
    expect(result.standings.MALE[0]?.races[0]?.score).toBe(1);
    expect(result.standings.FEMALE[0]?.races[0]?.score).toBe(1);
  });

  it('leaves a race the runner did not contest as null rather than zero', () => {
    const result = run(placings('a', 'MALE', [1]));
    const standing = result.standings.MALE[0];
    expect(standing?.races[0]?.score).toBe(1);
    expect(standing?.races[1]?.score).toBeNull();
    expect(standing?.racesCompleted).toBe(1);
  });

  it('marks a shared category position as tied', () => {
    const result = run([
      ...placings('a', 'MALE', [1]),
      ...placings('b', 'MALE', [1]),
      ...placings('c', 'MALE', [3]),
    ]);
    const byId = Object.fromEntries(result.standings.MALE.map((s) => [s.runnerId, s]));
    expect(byId.a?.races[0]?.tied).toBe(true);
    expect(byId.b?.races[0]?.tied).toBe(true);
    expect(byId.c?.races[0]?.tied).toBe(false);
    // A dead heat scores both runners the same, and the next place skips one.
    expect(byId.a?.races[0]?.score).toBe(1);
    expect(byId.c?.races[0]?.score).toBe(3);
  });
});

describe('eligibility', () => {
  it('needs six qualifying results before a runner is eligible', () => {
    const result = run([
      ...placings('five', 'MALE', [1, 1, 1, 1, 1]),
      ...placings('six', 'MALE', [2, 2, 2, 2, 2, 2]),
    ]);
    const byId = Object.fromEntries(result.standings.MALE.map((s) => [s.runnerId, s]));

    expect(byId.five?.eligible).toBe(false);
    expect(byId.five?.bestSixTotal).toBeNull();
    expect(byId.five?.position).toBeNull();
    expect(byId.six?.eligible).toBe(true);
    expect(byId.six?.bestSixTotal).toBe(12);
    expect(byId.six?.position).toBe(1);
  });

  it('keeps ineligible runners visible with their progress', () => {
    const result = run(placings('four', 'FEMALE', [1, 1, 1, 1]));
    const standing = result.standings.FEMALE[0];
    expect(standing).toBeDefined();
    expect(standing?.racesCompleted).toBe(4);
    expect(standing?.racesRequired).toBe(6);
    expect(eligibilityLabel(standing!)).toBe('Not yet eligible — 4 of 6 races');
  });

  it('lists ineligible runners after every eligible runner', () => {
    const result = run([
      ...placings('nearly', 'MALE', [1, 1, 1, 1, 1]),
      ...placings('qualified', 'MALE', [9, 9, 9, 9, 9, 9]),
    ]);
    // Even though "nearly" has far better individual scores, only a qualified
    // runner takes a position, and they sort ahead.
    expect(result.standings.MALE.map((s) => s.runnerId)).toEqual(['qualified', 'nearly']);
  });
});

describe('championship totals', () => {
  it('counts only the six lowest scores when more than six exist', () => {
    const result = run(placings('a', 'MALE', [10, 1, 2, 9, 3, 4, 5, 8]));
    const standing = result.standings.MALE[0];

    // The six lowest are 1, 2, 3, 4, 5, 8 = 23; the 9 and the 10 are dropped.
    expect(standing?.bestSixTotal).toBe(23);
    expect(standing?.racesCompleted).toBe(8);

    const counting = standing?.races.filter((r) => r.counts).map((r) => r.score);
    expect(counting?.sort((a, b) => (a as number) - (b as number))).toEqual([1, 2, 3, 4, 5, 8]);
  });

  it('marks nothing as counting until the runner is eligible', () => {
    // With five races there is no best-six total, so highlighting cells would
    // imply a total that does not exist.
    const result = run(placings('a', 'MALE', [1, 2, 3, 4, 5]));
    const standing = result.standings.MALE[0];
    expect(standing?.eligible).toBe(false);
    expect(standing?.bestSixTotal).toBeNull();
    expect(standing?.races.some((race) => race.counts)).toBe(false);
    // The scores themselves are still shown.
    expect(standing?.races.filter((race) => race.score !== null)).toHaveLength(5);
  });

  it('marks exactly six races as counting', () => {
    const result = run(placings('a', 'MALE', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(result.standings.MALE[0]?.races.filter((r) => r.counts)).toHaveLength(6);
  });

  it('gives the lowest total the lead', () => {
    const result = run([
      ...placings('low', 'MALE', [1, 1, 1, 1, 1, 1]),
      ...placings('mid', 'MALE', [3, 3, 3, 3, 3, 3]),
      ...placings('high', 'MALE', [5, 5, 5, 5, 5, 5]),
    ]);
    expect(result.standings.MALE.map((s) => [s.runnerId, s.bestSixTotal, s.position])).toEqual([
      ['low', 6, 1],
      ['mid', 18, 2],
      ['high', 30, 3],
    ]);
  });

  it('ties equal totals and skips the following position', () => {
    const result = run([
      ...placings('a', 'MALE', [1, 1, 1, 1, 1, 1]),
      ...placings('b', 'MALE', [2, 2, 2, 2, 2, 2]),
      ...placings('c', 'MALE', [2, 2, 2, 2, 2, 2]),
      ...placings('d', 'MALE', [4, 4, 4, 4, 4, 4]),
    ]);
    expect(result.standings.MALE.map((s) => s.position)).toEqual([1, 2, 2, 4]);
    expect(result.standings.MALE.map((s) => s.tied)).toEqual([false, true, true, false]);
  });
});

describe('published-only filtering', () => {
  it('ignores unpublished races in the public view', () => {
    const draftRaces = races.map((race, index) =>
      index === 0 ? { ...race, published: false } : race,
    );
    const entries = placings('a', 'MALE', [1, 2, 3, 4, 5, 6]);

    const publicView = scoreChampionship({
      year: 2025,
      races: draftRaces,
      entries,
      publishedOnly: true,
    });
    const adminView = scoreChampionship({
      year: 2025,
      races: draftRaces,
      entries,
      publishedOnly: false,
    });

    // Losing the draft race drops the runner from six results to five.
    expect(publicView.standings.MALE[0]?.racesCompleted).toBe(5);
    expect(publicView.standings.MALE[0]?.eligible).toBe(false);
    expect(adminView.standings.MALE[0]?.racesCompleted).toBe(6);
    expect(adminView.standings.MALE[0]?.eligible).toBe(true);
  });
});

describe('recalculation after a corrected placing', () => {
  it('recomputes the total and the counting set when a placing changes', () => {
    const before = run(placings('a', 'MALE', [1, 2, 3, 4, 5, 9]));
    expect(before.standings.MALE[0]?.bestSixTotal).toBe(24);

    const corrected = placings('a', 'MALE', [1, 2, 3, 4, 5, 6]);
    const after = run(corrected);
    expect(after.standings.MALE[0]?.bestSixTotal).toBe(21);
  });

  it('reorders the table when a correction overtakes a rival', () => {
    const base = [...placings('rival', 'MALE', [2, 2, 2, 2, 2, 2])];

    const before = run([...base, ...placings('a', 'MALE', [3, 3, 3, 3, 3, 3])]);
    expect(before.standings.MALE.map((s) => s.runnerId)).toEqual(['rival', 'a']);

    const after = run([...base, ...placings('a', 'MALE', [1, 1, 1, 1, 1, 1])]);
    expect(after.standings.MALE.map((s) => s.runnerId)).toEqual(['a', 'rival']);
  });
});
