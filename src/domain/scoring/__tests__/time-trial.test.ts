import { describe, expect, it } from 'vitest';
import { scoreRound } from '../time-trial';
import type { RoundEntryInput } from '../time-trial';
import { entry, mmss, utc, type FixtureRunner } from './fixtures';

const runner = (id: string, category: 'MALE' | 'FEMALE', birth = '1986-01-01'): FixtureRunner => ({
  runnerId: id,
  category,
  dateOfBirth: utc(birth),
});

const ROUND_DATE = utc('2026-01-20');

function score(entries: readonly RoundEntryInput[], priorResults = []) {
  return scoreRound({
    seasonType: 'WINTER',
    roundOrdinal: 2,
    roundDate: ROUND_DATE,
    entries,
    priorResults,
  });
}

const pointsFor = (result: { results: readonly { runnerId: string; finishingPoints: number }[] }) =>
  Object.fromEntries(result.results.map((r) => [r.runnerId, r.finishingPoints]));

describe('finishing points', () => {
  it('awards the winner one point per runner in the larger field', () => {
    for (const fieldSize of [1, 2, 5, 9, 10, 15]) {
      const entries = Array.from({ length: fieldSize }, (_, index) =>
        entry(runner(`r${index}`, 'MALE'), 'TWO_LAP', mmss(20, index)),
      );
      const result = score(entries);
      const winner = result.results.find((r) => r.runnerId === 'r0');
      expect(winner?.finishingPosition, `field of ${fieldSize}`).toBe(1);
      expect(winner?.finishingPoints, `field of ${fieldSize}`).toBe(fieldSize);
    }
  });

  it('descends by one point per position, with the last finisher on one', () => {
    // Thirteen runners means thirteen points for the win. Nobody scores zero
    // for finishing, which is the change from the old fixed ten-point ladder.
    const entries = Array.from({ length: 13 }, (_, index) =>
      entry(runner(`r${index}`, 'MALE'), 'TWO_LAP', mmss(20, index)),
    );
    const points = pointsFor(score(entries));
    expect(Object.values(points)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('never pays a finisher zero, whatever the field size or shape', () => {
    // The old ladder capped at ten and paid nothing from eleventh down. Under
    // the club's rule the ladder is as long as the field, so the last finisher
    // in the larger field scores exactly 1 and nobody scores 0.
    for (const [two, three] of [
      [1, 0],
      [13, 4],
      [4, 13],
      [11, 11],
      [25, 1],
    ] as const) {
      const entries = [
        ...Array.from({ length: two }, (_, i) =>
          entry(runner(`two-${i}`, 'MALE'), 'TWO_LAP', mmss(20, i)),
        ),
        ...Array.from({ length: three }, (_, i) =>
          entry(runner(`three-${i}`, 'MALE'), 'THREE_LAP', mmss(30, i)),
        ),
      ];
      const result = score(entries);
      const points = result.results.map((r) => r.finishingPoints);
      expect(Math.min(...points), `field ${two}/${three}`).toBe(1);
      expect(Math.max(...points), `field ${two}/${three}`).toBe(Math.max(two, three));
    }
  });

  it('still pays at least one point when a dead heat shortens the ladder', () => {
    // Two runners tie for last in a field of four. Competition ranking means
    // nobody takes position 4, so the floor lands at 2 rather than 1 — but it
    // is still never 0.
    const entries = [
      entry(runner('a', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('b', 'MALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('c', 'MALE'), 'TWO_LAP', mmss(22, 0)),
      entry(runner('d', 'MALE'), 'TWO_LAP', mmss(22, 0)),
    ];
    const points = Object.values(pointsFor(score(entries)));
    expect(points).toEqual([4, 3, 2, 2]);
    expect(Math.min(...points)).toBeGreaterThan(0);
  });

  it('sizes both ladders from the larger field, so a small field is not penalised', () => {
    // Four three-lap runners score off the same ladder as the nine two-lap
    // runners: the three-lap winner takes 9, not 4.
    const entries = [
      ...Array.from({ length: 9 }, (_, i) =>
        entry(runner(`two-${i}`, 'MALE'), 'TWO_LAP', mmss(20, i)),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        entry(runner(`three-${i}`, 'MALE'), 'THREE_LAP', mmss(30, i)),
      ),
    ];
    const points = pointsFor(score(entries));
    expect(points['two-0']).toBe(9);
    expect(points['three-0']).toBe(9);
    expect(points['three-3']).toBe(6);
  });

  it('ranks the two distances independently', () => {
    // The slowest two-lap runner is still faster than the fastest three-lap
    // runner, yet both fields must produce their own winner on 10 points.
    const entries = [
      entry(runner('two-a', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('two-b', 'MALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('three-a', 'MALE'), 'THREE_LAP', mmss(30, 0)),
      entry(runner('three-b', 'MALE'), 'THREE_LAP', mmss(31, 0)),
    ];
    const points = pointsFor(score(entries));
    expect(points).toEqual({ 'two-a': 2, 'two-b': 1, 'three-a': 2, 'three-b': 1 });
  });

  it('ranks male and female runners in one shared field per distance', () => {
    const entries = [
      entry(runner('f1', 'FEMALE'), 'TWO_LAP', mmss(19, 0)),
      entry(runner('m1', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('f2', 'FEMALE'), 'TWO_LAP', mmss(21, 0)),
    ];
    const result = score(entries);
    // The female runner beat the male runner outright, so she takes top points.
    expect(pointsFor(result)).toEqual({ f1: 3, m1: 2, f2: 1 });
  });

  it('filtering by category does not change any calculated point value', () => {
    const entries = [
      entry(runner('f1', 'FEMALE'), 'TWO_LAP', mmss(19, 0)),
      entry(runner('m1', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('f2', 'FEMALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('m2', 'MALE'), 'TWO_LAP', mmss(22, 0)),
    ];
    const mixed = score(entries);
    const femaleView = mixed.results.filter((r) => r.category === 'FEMALE');

    // Displaying a female-only table must not renumber her as 1st and 2nd with
    // 4 and 3 points; she keeps the 4 and 2 earned in the mixed field.
    expect(femaleView.map((r) => r.finishingPoints)).toEqual([4, 2]);
    expect(femaleView.map((r) => r.finishingPosition)).toEqual([1, 3]);
  });

  it('gives tied times the same position and skips the following places', () => {
    const entries = [
      entry(runner('a', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('b', 'MALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('c', 'MALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('d', 'MALE'), 'TWO_LAP', mmss(22, 0)),
    ];
    const result = score(entries);
    const byId = Object.fromEntries(result.results.map((r) => [r.runnerId, r]));

    expect([byId.a, byId.b, byId.c, byId.d].map((r) => r?.finishingPosition)).toEqual([1, 2, 2, 4]);
    expect([byId.a, byId.b, byId.c, byId.d].map((r) => r?.finishingPoints)).toEqual([4, 3, 3, 1]);
    expect(byId.b?.tiedOnTime).toBe(true);
    expect(byId.a?.tiedOnTime).toBe(false);
  });
});

describe('improvement points', () => {
  const priorAt = (runnerId: string, choice: 'TWO_LAP' | 'THREE_LAP', percent: number) => ({
    runnerId,
    distanceChoice: choice,
    roundOrdinal: 1,
    ageGradePercent: percent,
  });

  function scoreWithPriors(entries: readonly RoundEntryInput[], priors: unknown[]) {
    return scoreRound({
      seasonType: 'WINTER',
      roundOrdinal: 2,
      roundDate: ROUND_DATE,
      entries,
      priorResults: priors as never,
    });
  }

  it('earns nothing on a first result in the season', () => {
    const result = scoreWithPriors([entry(runner('a', 'MALE'), 'TWO_LAP', mmss(20, 0))], []);
    const only = result.results[0];
    expect(only?.previousAgeGradePercent).toBeNull();
    expect(only?.improvement).toBeNull();
    expect(only?.improvementPoints).toBe(0);
    expect(result.improverCount).toBe(0);
  });

  it('earns nothing on the first result after switching distance', () => {
    const a = runner('a', 'MALE');
    // The runner has two-lap history but is running three laps for the
    // first time, so there is nothing comparable to improve on.
    const result = scoreWithPriors(
      [entry(a, 'THREE_LAP', mmss(30, 0))],
      [priorAt('a', 'TWO_LAP', 60)],
    );
    expect(result.results[0]?.previousAgeGradePercent).toBeNull();
    expect(result.results[0]?.improvementPoints).toBe(0);
  });

  it('compares against the most recent earlier result at that distance', () => {
    const a = runner('a', 'MALE');
    const result = scoreRound({
      seasonType: 'WINTER',
      roundOrdinal: 5,
      roundDate: ROUND_DATE,
      entries: [entry(a, 'TWO_LAP', mmss(20, 0))],
      priorResults: [
        { runnerId: 'a', distanceChoice: 'TWO_LAP', roundOrdinal: 1, ageGradePercent: 50 },
        { runnerId: 'a', distanceChoice: 'TWO_LAP', roundOrdinal: 3, ageGradePercent: 55 },
        // Round 6 is in the future relative to round 5 and must be ignored.
        { runnerId: 'a', distanceChoice: 'TWO_LAP', roundOrdinal: 6, ageGradePercent: 99 },
      ],
    });
    // Rounds 2 and 4 were missed; the comparison reaches back to round 3.
    expect(result.results[0]?.previousAgeGradePercent).toBe(55);
    expect(result.results[0]?.previousRoundOrdinal).toBe(3);
  });

  it('combines every improver across both distances and both categories', () => {
    const entries = [
      entry(runner('m-two', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('f-two', 'FEMALE'), 'TWO_LAP', mmss(24, 0)),
      entry(runner('m-three', 'MALE'), 'THREE_LAP', mmss(30, 0)),
      entry(runner('f-three', 'FEMALE'), 'THREE_LAP', mmss(36, 0)),
    ];
    const graded = scoreWithPriors(entries, []);
    const currentFor = (id: string) =>
      graded.results.find((r) => r.runnerId === id)?.ageGradePercent as number;

    // Improvements of 4, 3, 2 and 1 points, deliberately alternating between
    // the two distances and the two categories.
    const result = scoreWithPriors(entries, [
      priorAt('m-two', 'TWO_LAP', currentFor('m-two') - 4),
      priorAt('f-three', 'THREE_LAP', currentFor('f-three') - 3),
      priorAt('m-three', 'THREE_LAP', currentFor('m-three') - 2),
      priorAt('f-two', 'TWO_LAP', currentFor('f-two') - 1),
    ]);

    expect(result.improverCount).toBe(4);
    const byId = Object.fromEntries(result.results.map((r) => [r.runnerId, r]));
    expect(byId['m-two']?.improvementPoints).toBe(4);
    expect(byId['f-three']?.improvementPoints).toBe(3);
    expect(byId['m-three']?.improvementPoints).toBe(2);
    expect(byId['f-two']?.improvementPoints).toBe(1);
  });

  it('ignores non-improvements and awards nothing for going backwards', () => {
    const entries = [
      entry(runner('better', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      entry(runner('same', 'MALE'), 'TWO_LAP', mmss(21, 0)),
      entry(runner('worse', 'MALE'), 'TWO_LAP', mmss(22, 0)),
    ];
    const graded = scoreWithPriors(entries, []);
    const currentFor = (id: string) =>
      graded.results.find((r) => r.runnerId === id)?.ageGradePercent as number;

    const result = scoreWithPriors(entries, [
      priorAt('better', 'TWO_LAP', currentFor('better') - 5),
      priorAt('same', 'TWO_LAP', currentFor('same')),
      priorAt('worse', 'TWO_LAP', currentFor('worse') + 5),
    ]);

    expect(result.improverCount).toBe(1);
    const byId = Object.fromEntries(result.results.map((r) => [r.runnerId, r]));
    // All three had a comparison available, so the ladder tops at 3 even though
    // only one of them improved.
    expect(byId.better?.improvementPoints).toBe(3);
    // Standing still is not improving, so it scores nothing.
    expect(byId.same?.improvementPoints).toBe(0);
    expect(byId.same?.improvement).toBeCloseTo(0, 9);
    expect(byId.worse?.improvementPoints).toBe(0);
    expect(byId.worse?.improvement).toBeLessThan(0);
  });

  it('ties equal improvements and skips the following places', () => {
    // The specification's worked example: five improvers ranked 1, 2, 2, 4, 5
    // receive 5, 4, 4, 2 and 1 points.
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
      entry(runner(id, 'MALE'), 'TWO_LAP', mmss(20, index)),
    );
    const graded = scoreWithPriors(entries, []);
    const currentFor = (id: string) =>
      graded.results.find((r) => r.runnerId === id)?.ageGradePercent as number;

    const improvements: Record<string, number> = { a: 9, b: 5, c: 5, d: 3, e: 1 };
    const result = scoreWithPriors(
      entries,
      Object.entries(improvements).map(([id, delta]) =>
        priorAt(id, 'TWO_LAP', currentFor(id) - delta),
      ),
    );

    const byId = Object.fromEntries(result.results.map((r) => [r.runnerId, r]));
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => byId[id]?.improvementPosition)).toEqual([
      1, 2, 2, 4, 5,
    ]);
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => byId[id]?.improvementPoints)).toEqual([
      5, 4, 4, 2, 1,
    ]);
  });
});

describe('round totals', () => {
  it('adds finishing and improvement points', () => {
    const a = runner('a', 'MALE');
    const graded = scoreRound({
      seasonType: 'WINTER',
      roundOrdinal: 2,
      roundDate: ROUND_DATE,
      entries: [entry(a, 'TWO_LAP', mmss(20, 0))],
      priorResults: [],
    });
    const current = graded.results[0]?.ageGradePercent as number;

    const result = scoreRound({
      seasonType: 'WINTER',
      roundOrdinal: 2,
      roundDate: ROUND_DATE,
      entries: [entry(a, 'TWO_LAP', mmss(20, 0))],
      priorResults: [
        { runnerId: 'a', distanceChoice: 'TWO_LAP', roundOrdinal: 1, ageGradePercent: current - 3 },
      ],
    });

    const only = result.results[0];
    // A field of one: one point for the win, and one for the only comparison.
    expect(only?.finishingPoints).toBe(1);
    expect(only?.improvementPoints).toBe(1);
    expect(only?.roundTotal).toBe(2);
    expect(Number.isInteger(only?.roundTotal)).toBe(true);
  });
});

describe('validation problems', () => {
  it('reports an unsupported age instead of throwing away the whole round', () => {
    const result = score([
      entry(runner('ok', 'MALE'), 'TWO_LAP', mmss(20, 0)),
      // Born in 2024, so aged 1 on the round date and off the bottom of the table.
      entry(runner('toddler', 'MALE', '2024-06-01'), 'TWO_LAP', mmss(40, 0)),
    ]);

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ runnerId: 'toddler', code: 'AGE_OUT_OF_RANGE' });

    const byId = Object.fromEntries(result.results.map((r) => [r.runnerId, r]));
    // Finishing points still calculate — only the age-graded parts are missing.
    // Two runners, so the ladder is 2 then 1.
    expect(byId.toddler?.finishingPoints).toBe(1);
    expect(byId.toddler?.ageGradePercent).toBeNull();
    expect(byId.ok?.ageGradePercent).not.toBeNull();
  });
});
