import { describe, expect, it } from 'vitest';
import { scoreSeason, type SeasonRoundInput } from '../season';
import { entry, mmss, utc, type FixtureRunner } from './fixtures';

const runner = (id: string, category: 'MALE' | 'FEMALE', birth = '1986-01-01'): FixtureRunner => ({
  runnerId: id,
  category,
  dateOfBirth: utc(birth),
});

const ALICE = runner('alice', 'FEMALE', '1988-05-10');
const BEN = runner('ben', 'MALE', '1979-02-20');
const CHLOE = runner('chloe', 'FEMALE', '1995-11-02');

const ROUND_DATES = [
  '2025-10-07',
  '2025-11-04',
  '2025-12-02',
  '2026-01-06',
  '2026-02-03',
  '2026-03-03',
] as const;

/** Builds a six-round winter season from per-round entry lists. */
function season(
  perRound: ReadonlyArray<ReadonlyArray<ReturnType<typeof entry>>>,
  options?: { publishedRounds?: number },
): SeasonRoundInput[] {
  const publishedRounds = options?.publishedRounds ?? perRound.length;
  return perRound.map((entries, index) => ({
    roundId: `round-${index + 1}`,
    ordinal: index + 1,
    date: utc(ROUND_DATES[index] as string),
    published: index < publishedRounds,
    entries,
  }));
}

describe('scoreSeason', () => {
  it('threads each round forward as the comparison for the next', () => {
    const result = scoreSeason({
      seasonType: 'WINTER',
      publishedOnly: true,
      rounds: season([
        [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
        [entry(ALICE, 'TWO_LAP', mmss(24, 0))],
        [entry(ALICE, 'TWO_LAP', mmss(23, 0))],
      ]),
    });

    const [first, second, third] = result.rounds;
    // Round 1 has nothing to compare against.
    expect(first?.results[0]?.improvementPoints).toBe(0);
    expect(first?.results[0]?.previousRoundOrdinal).toBeNull();
    // Rounds 2 and 3 each improve on the round before, and each is the only
    // improver, so each takes a single point.
    expect(second?.results[0]?.previousRoundOrdinal).toBe(1);
    expect(second?.results[0]?.improvementPoints).toBe(1);
    expect(third?.results[0]?.previousRoundOrdinal).toBe(2);
    expect(third?.results[0]?.improvementPoints).toBe(1);
  });

  it('looks back past a missed round to the last result at that distance', () => {
    const result = scoreSeason({
      seasonType: 'WINTER',
      publishedOnly: true,
      rounds: season([
        [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
        [entry(BEN, 'TWO_LAP', mmss(20, 0))],
        [entry(BEN, 'TWO_LAP', mmss(19, 30))],
        [entry(ALICE, 'TWO_LAP', mmss(24, 0))],
      ]),
    });

    const fourth = result.rounds[3];
    const alice = fourth?.results.find((r) => r.runnerId === 'alice');
    // Alice sat out rounds 2 and 3; the comparison reaches back to round 1.
    expect(alice?.previousRoundOrdinal).toBe(1);
    expect(alice?.improvement).toBeGreaterThan(0);
  });

  it('counts only the best four round totals', () => {
    // A July birthday means this runner's age is constant across an
    // October-to-March season, which isolates best-four selection from the
    // age-grade drift covered by the next test.
    const steady = runner('steady', 'MALE', '1979-07-20');
    const rounds = season(
      Array.from({ length: 6 }, () => [
        entry(steady, 'TWO_LAP', mmss(20, 0)),
        entry(ALICE, 'TWO_LAP', mmss(25, 0)),
      ]),
    );
    const result = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });

    const leader = result.standings.MALE[0];
    expect(leader?.roundsCompleted).toBe(6);
    expect(leader?.rounds.filter((r) => r.counts)).toHaveLength(4);
    // Every round is worth 10 finishing points and nobody improves (identical
    // times, unchanging ages), so the best four sum to 40, not the six-round 60.
    expect(leader?.bestFourTotal).toBe(40);
    expect(leader?.rounds.every((r) => r.total === 10)).toBe(true);
  });

  it('treats a mid-season birthday as a genuine age-grade improvement', () => {
    // Ben turns 47 on 20 February, between rounds 5 and 6. Running the exact
    // same time at a higher age grades better against a slower standard, so the
    // engine correctly sees an improvement even though the clock did not move.
    // This is a property of age grading, not a bug in the comparison chain.
    const rounds = season(Array.from({ length: 6 }, () => [entry(BEN, 'TWO_LAP', mmss(20, 0))]));
    const result = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });

    const finalRound = result.rounds[5];
    expect(finalRound?.results[0]?.ageOnRoundDate).toBe(47);
    expect(result.rounds[4]?.results[0]?.ageOnRoundDate).toBe(46);
    expect(finalRound?.results[0]?.improvement).toBeGreaterThan(0);
    expect(finalRound?.results[0]?.improvementPoints).toBe(1);

    // 10 finishing points every round, plus the single improvement point.
    expect(result.standings.MALE[0]?.bestFourTotal).toBe(41);
  });

  it('sums only what was run when a runner completed fewer than four rounds', () => {
    const rounds = season([
      [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
      [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
    ]);
    const result = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });
    const alice = result.standings.FEMALE[0];

    expect(alice?.roundsCompleted).toBe(2);
    expect(alice?.bestFourTotal).toBe(20);
    expect(alice?.rounds.every((r) => r.counts || r.total === null)).toBe(true);
  });

  it('shows an em-dash-worthy null for a round the runner missed, not a zero', () => {
    const rounds = season([
      [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
      [entry(BEN, 'TWO_LAP', mmss(20, 0))],
    ]);
    const result = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });
    const alice = result.standings.FEMALE[0];

    expect(alice?.rounds[0]?.total).toBe(10);
    // Absence must stay distinguishable from a scoring zero.
    expect(alice?.rounds[1]?.total).toBeNull();
  });

  it('ties equal season totals without a secondary tie-break', () => {
    const rounds = season([
      [entry(ALICE, 'TWO_LAP', mmss(25, 0)), entry(CHLOE, 'TWO_LAP', mmss(25, 0))],
    ]);
    const result = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });

    const [first, second] = result.standings.FEMALE;
    expect(first?.bestFourTotal).toBe(second?.bestFourTotal);
    expect(first?.position).toBe(1);
    expect(second?.position).toBe(1);
    expect(first?.tied).toBe(true);
  });

  it('excludes draft rounds from published standings and from the improvement chain', () => {
    const rounds = season(
      [
        [entry(ALICE, 'TWO_LAP', mmss(25, 0))],
        [entry(ALICE, 'TWO_LAP', mmss(24, 0))],
        [entry(ALICE, 'TWO_LAP', mmss(23, 0))],
      ],
      { publishedRounds: 2 },
    );

    const published = scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });
    expect(published.rounds).toHaveLength(2);
    expect(published.standings.FEMALE[0]?.roundsCompleted).toBe(2);

    const withDraft = scoreSeason({ seasonType: 'WINTER', publishedOnly: false, rounds });
    expect(withDraft.rounds).toHaveLength(3);
    // Standings still only reflect published rounds, even when drafts are scored.
    expect(withDraft.standings.FEMALE[0]?.roundsCompleted).toBe(2);
  });
});

describe('recalculation after historical edits', () => {
  /** Two rounds where round 2's improvement depends on round 1's time. */
  const buildRounds = (roundOneTime: number, dateOfBirth = ALICE.dateOfBirth) =>
    season([
      [entry({ ...ALICE, dateOfBirth }, 'TWO_LAP', roundOneTime)],
      [entry({ ...ALICE, dateOfBirth }, 'TWO_LAP', mmss(24, 0))],
    ]);

  const run = (rounds: SeasonRoundInput[]) =>
    scoreSeason({ seasonType: 'WINTER', publishedOnly: true, rounds });

  it('changing an earlier time changes the later improvement', () => {
    const before = run(buildRounds(mmss(25, 0)));
    const after = run(buildRounds(mmss(23, 0)));

    const improvementBefore = before.rounds[1]?.results[0]?.improvement as number;
    const improvementAfter = after.rounds[1]?.results[0]?.improvement as number;

    // Round 1 got faster, so the round 2 improvement shrinks — and here it
    // turns negative, costing the improvement point entirely.
    expect(improvementBefore).toBeGreaterThan(0);
    expect(improvementAfter).toBeLessThan(0);
    expect(before.rounds[1]?.results[0]?.improvementPoints).toBe(1);
    expect(after.rounds[1]?.results[0]?.improvementPoints).toBe(0);
  });

  it('changing a date of birth changes both age grades but can leave points intact', () => {
    const before = run(buildRounds(mmss(25, 0)));
    const after = run(buildRounds(mmss(25, 0), utc('1970-05-10')));

    const gradeBefore = before.rounds[1]?.results[0]?.ageGradePercent as number;
    const gradeAfter = after.rounds[1]?.results[0]?.ageGradePercent as number;

    // An older runner is graded against a slower standard, so the same time
    // scores a higher percentage.
    expect(gradeAfter).toBeGreaterThan(gradeBefore);
    // The improvement is still positive, so the single improver still scores 1.
    expect(after.rounds[1]?.results[0]?.improvementPoints).toBe(1);
  });

  it('changing a scoring category changes the age grade', () => {
    const male = run(
      season([
        [entry({ ...ALICE, category: 'MALE' }, 'TWO_LAP', mmss(25, 0))],
        [entry({ ...ALICE, category: 'MALE' }, 'TWO_LAP', mmss(24, 0))],
      ]),
    );
    const female = run(buildRounds(mmss(25, 0)));

    expect(male.standings.MALE).toHaveLength(1);
    expect(male.standings.FEMALE).toHaveLength(0);
    expect(female.standings.FEMALE).toHaveLength(1);
    expect(male.rounds[1]?.results[0]?.ageGradePercent).not.toBeCloseTo(
      female.rounds[1]?.results[0]?.ageGradePercent as number,
      6,
    );
  });

  it('changing distance breaks the comparison chain', () => {
    const switched = run(
      season([[entry(ALICE, 'TWO_LAP', mmss(25, 0))], [entry(ALICE, 'THREE_LAP', mmss(37, 0))]]),
    );
    expect(switched.rounds[1]?.results[0]?.previousAgeGradePercent).toBeNull();
    expect(switched.rounds[1]?.results[0]?.improvementPoints).toBe(0);
  });

  it('is deterministic: replaying identical input reproduces identical output', () => {
    const first = run(buildRounds(mmss(25, 0)));
    const second = run(buildRounds(mmss(25, 0)));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
