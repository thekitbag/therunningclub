import { beforeEach, describe, expect, it } from 'vitest';
import {
  addResult,
  clearCookies,
  createAdmin,
  createRound,
  createRunnerRecord,
  createWinterSeason,
  signInAs,
} from './helpers';
import { prisma } from '@/lib/db';
import {
  computeSeasonScoring,
  previewRoundPublication,
  publishRound,
  saveRoundResults,
  unpublishRound,
  updateRound,
} from '@/services/time-trials';
import { updateRunner } from '@/services/runners';
import { getPublicRoundView, getPublicSeasonView } from '@/services/public-queries';
import { ServiceError } from '@/services/errors';

beforeEach(() => clearCookies());

async function setUp() {
  const admin = await createAdmin();
  await signInAs(admin.id);
  const season = await createWinterSeason();
  return { admin, season };
}

describe('draft versus published visibility', () => {
  it('hides a draft round from the public season view', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Ada',
      familyName: 'Runner',
      dateOfBirth: '1988-05-10',
      category: 'FEMALE',
    });

    const published = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');
    const draft = await createRound(season.id, 2, '2025-11-04', 'DRAFT');
    await addResult(published.id, runner.id, '25:00');
    await addResult(draft.id, runner.id, '24:00');

    const view = await getPublicSeasonView(season.slug);
    expect(view?.standings.FEMALE[0]?.roundsCompleted).toBe(1);
    expect(view?.rounds.find((round) => round.id === draft.id)?.published).toBe(false);
    // The draft round's result count is not disclosed either.
    expect(view?.rounds.find((round) => round.id === draft.id)?.resultCount).toBe(0);

    // And its results page is not reachable.
    expect(await getPublicRoundView(season.slug, draft.id)).toBeNull();
    expect(await getPublicRoundView(season.slug, published.id)).not.toBeNull();
  });

  it('hides an entire draft season even when its rounds are published', async () => {
    await setUp();
    const season = await createWinterSeason('Draft Season', 'DRAFT');
    const runner = await createRunnerRecord({
      givenName: 'Ben',
      familyName: 'Runner',
      dateOfBirth: '1980-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');
    await addResult(round.id, runner.id, '20:00');

    expect(await getPublicSeasonView(season.slug)).toBeNull();
    expect(await getPublicRoundView(season.slug, round.id)).toBeNull();
  });
});

describe('publishing a round', () => {
  it('publishes atomically and makes results public', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Cara',
      familyName: 'Runner',
      dateOfBirth: '1990-03-03',
      category: 'FEMALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'DRAFT');
    await addResult(round.id, runner.id, '23:30');

    expect(await getPublicRoundView(season.slug, round.id)).toBeNull();

    await publishRound(round.id);

    const view = await getPublicRoundView(season.slug, round.id);
    expect(view?.byDistance.TWO_LAP.rows).toHaveLength(1);
    expect(view?.byDistance.TWO_LAP.rows[0]?.finishingPoints).toBe(10);

    const stored = await prisma.ttRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(stored.state).toBe('PUBLISHED');
    expect(stored.publishedAt).not.toBeNull();
    expect(stored.publishedById).not.toBeNull();
  });

  it('refuses to publish an empty round', async () => {
    const { season } = await setUp();
    const round = await createRound(season.id, 1, '2025-10-07', 'DRAFT');
    await expect(publishRound(round.id)).rejects.toThrow(/at least one result/);
  });

  it('refuses to publish a round containing a result that cannot be age-graded', async () => {
    const { season } = await setUp();
    // Born in 2024, so aged 1 on the round date and off the bottom of the table.
    const toddler = await createRunnerRecord({
      givenName: 'Too',
      familyName: 'Young',
      dateOfBirth: '2024-06-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'DRAFT');
    await addResult(round.id, toddler.id, '40:00');

    await expect(publishRound(round.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'BLOCKED_BY_VALIDATION' }),
    );

    // Nothing was published, and the failure did not leave a half-written state.
    const stored = await prisma.ttRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(stored.state).toBe('DRAFT');
    expect(stored.publishedAt).toBeNull();
  });

  it('unpublishing removes the round from public standings', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Dee',
      familyName: 'Runner',
      dateOfBirth: '1985-02-02',
      category: 'FEMALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');
    await addResult(round.id, runner.id, '25:00');

    expect((await getPublicSeasonView(season.slug))?.standings.FEMALE).toHaveLength(1);

    await unpublishRound(round.id);

    expect((await getPublicSeasonView(season.slug))?.standings.FEMALE).toHaveLength(0);
    expect(await getPublicRoundView(season.slug, round.id)).toBeNull();
  });
});

describe('recalculation after historical edits', () => {
  /** Two published rounds where round 2's improvement depends on round 1. */
  async function twoRoundSeason() {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Eve',
      familyName: 'Runner',
      dateOfBirth: '1986-07-07',
      category: 'FEMALE',
    });
    const roundOne = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');
    const roundTwo = await createRound(season.id, 2, '2025-11-04', 'PUBLISHED');
    await saveRoundResults(roundOne.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    ]);
    await saveRoundResults(roundTwo.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '24:00' },
    ]);
    return { season, runner, roundOne, roundTwo };
  }

  it('rewrites derived columns in the database, not just in memory', async () => {
    const { roundTwo, runner } = await twoRoundSeason();

    const stored = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });
    expect(stored.finishingPoints).toBe(10);
    expect(stored.improvementPoints).toBe(1);
    expect(stored.roundTotal).toBe(11);
    expect(stored.ageGradePercent).not.toBeNull();
    expect(stored.previousRoundOrdinal).toBe(1);
    expect(stored.calculationTrace).not.toBeNull();
  });

  it('changing an earlier time recalculates the later round', async () => {
    const { runner, roundOne, roundTwo } = await twoRoundSeason();

    const before = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });
    expect(before.improvementPoints).toBe(1);

    // Make round 1 faster than round 2, so round 2 is no longer an improvement.
    await saveRoundResults(roundOne.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '22:00' },
    ]);

    const after = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });
    expect(after.improvementPoints).toBe(0);
    expect(after.roundTotal).toBe(10);
    expect(Number(after.improvement)).toBeLessThan(0);
  });

  it('changing a date of birth recalculates every age grade for that runner', async () => {
    const { runner, roundTwo } = await twoRoundSeason();

    const before = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });

    await updateRunner(runner.id, {
      givenName: 'Eve',
      familyName: 'Runner',
      dateOfBirth: '1960-07-07',
      category: 'FEMALE',
      status: 'ACTIVE',
    });

    const after = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });
    // An older runner is graded against a slower standard, so the same time
    // scores higher.
    expect(Number(after.ageGradePercent)).toBeGreaterThan(Number(before.ageGradePercent));
    expect(after.ageOnRoundDate).toBeGreaterThan(before.ageOnRoundDate!);
  });

  it('changing a scoring category moves the runner between tables', async () => {
    const { season, runner } = await twoRoundSeason();

    expect((await getPublicSeasonView(season.slug))?.standings.FEMALE).toHaveLength(1);

    await updateRunner(runner.id, {
      givenName: 'Eve',
      familyName: 'Runner',
      dateOfBirth: '1986-07-07',
      category: 'MALE',
      status: 'ACTIVE',
    });

    const view = await getPublicSeasonView(season.slug);
    expect(view?.standings.FEMALE).toHaveLength(0);
    expect(view?.standings.MALE).toHaveLength(1);
  });

  it('reordering rounds recalculates the comparison chain', async () => {
    const { runner, roundOne, roundTwo } = await twoRoundSeason();

    // Swap the two rounds around. Round 2 (24:00) becomes first and therefore
    // has nothing to improve on; the 25:00 run becomes a regression.
    await updateRound(roundOne.id, { name: 'Round 1', date: '2025-10-07', ordinal: 5 });
    await updateRound(roundTwo.id, { name: 'Round 2', date: '2025-11-04', ordinal: 1 });
    await updateRound(roundOne.id, { name: 'Round 1', date: '2025-12-02', ordinal: 2 });

    const nowFirst = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundTwo.id, runnerId: runner.id },
    });
    const nowSecond = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: roundOne.id, runnerId: runner.id },
    });

    expect(nowFirst.previousRoundOrdinal).toBeNull();
    expect(nowFirst.improvementPoints).toBe(0);
    expect(nowSecond.previousRoundOrdinal).toBe(1);
    expect(nowSecond.improvementPoints).toBe(0);
  });

  it('removing a runner from a round deletes their result and reranks the rest', async () => {
    const { season } = await setUp();
    const fast = await createRunnerRecord({
      givenName: 'Fast',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const slow = await createRunnerRecord({
      givenName: 'Slow',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');

    await saveRoundResults(round.id, [
      { runnerId: fast.id, distanceChoice: 'TWO_LAP', time: '20:00' },
      { runnerId: slow.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    ]);
    expect(
      (await prisma.ttResult.findFirstOrThrow({ where: { runnerId: slow.id } })).finishingPoints,
    ).toBe(9);

    await saveRoundResults(round.id, [
      { runnerId: slow.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    ]);

    expect(await prisma.ttResult.findFirst({ where: { runnerId: fast.id } })).toBeNull();
    // The remaining runner is now the winner.
    expect(
      (await prisma.ttResult.findFirstOrThrow({ where: { runnerId: slow.id } })).finishingPoints,
    ).toBe(10);
  });
});

describe('publication impact preview', () => {
  it('reports later rounds and season totals that would change, without writing', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Gwen',
      familyName: 'Runner',
      dateOfBirth: '1984-04-04',
      category: 'FEMALE',
    });

    const roundOne = await createRound(season.id, 1, '2025-10-07', 'DRAFT');
    const roundTwo = await createRound(season.id, 2, '2025-11-04', 'PUBLISHED');
    await saveRoundResults(roundOne.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    ]);
    await saveRoundResults(roundTwo.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '24:00' },
    ]);

    const impact = await previewRoundPublication(roundOne.id);

    expect(impact.canPublish).toBe(true);
    expect(impact.blockingProblems).toEqual([]);
    expect(impact.resultCount).toBe(1);
    // Publishing round 1 gives round 2 something to improve on.
    expect(impact.affectedLaterRounds.map((round) => round.ordinal)).toContain(2);
    expect(impact.standingsChanges.length).toBeGreaterThan(0);

    // Nothing was published as a side effect of previewing.
    expect((await prisma.ttRound.findUniqueOrThrow({ where: { id: roundOne.id } })).state).toBe(
      'DRAFT',
    );
  });

  it('reports blocking problems and refuses publication', async () => {
    const { season } = await setUp();
    const toddler = await createRunnerRecord({
      givenName: 'Too',
      familyName: 'Young',
      dateOfBirth: '2024-06-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07', 'DRAFT');
    await addResult(round.id, toddler.id, '40:00');

    const impact = await previewRoundPublication(round.id);
    expect(impact.canPublish).toBe(false);
    expect(impact.blockingProblems[0]?.runnerName).toBe('Too Young');
    expect(impact.blockingProblems[0]?.message).toMatch(/outside the published/);
  });
});

describe('database constraints', () => {
  it('refuses two results for the same runner in the same round', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Ivy',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');
    await addResult(round.id, runner.id, '25:00');

    await expect(addResult(round.id, runner.id, '24:00')).rejects.toThrow();
  });

  it('refuses two rounds with the same ordinal in a season', async () => {
    const { season } = await setUp();
    await createRound(season.id, 1, '2025-10-07');
    await expect(createRound(season.id, 1, '2025-11-04')).rejects.toThrow();
  });

  it('refuses more than six rounds through the service', async () => {
    const { season } = await setUp();
    const { createRound: createRoundService } = await import('@/services/time-trials');
    const dates = [
      '2025-10-07',
      '2025-11-04',
      '2025-12-02',
      '2026-01-06',
      '2026-02-03',
      '2026-03-03',
    ];
    for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
      await createRoundService(season.id, {
        name: `Round ${ordinal}`,
        date: dates[ordinal - 1] as string,
        ordinal: String(ordinal),
      });
    }
    await expect(
      createRoundService(season.id, { name: 'Round 7', date: '2026-03-01', ordinal: '6' }),
    ).rejects.toThrow(ServiceError);
  });

  it('rejects a duplicate runner within one save', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Jo',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');

    await expect(
      saveRoundResults(round.id, [
        { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '20:00' },
        { runnerId: runner.id, distanceChoice: 'THREE_LAP', time: '30:00' },
      ]),
    ).rejects.toThrow(/only have one result/);
  });

  it('rejects an unparseable time with a message naming the row', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Kai',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');

    await expect(
      saveRoundResults(round.id, [
        { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: 'not a time' },
      ]),
    ).rejects.toThrow(/Check the time in row 1/);
  });

  it('stores elapsed time as an exact integer', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Lea',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');
    await saveRoundResults(round.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '22:33.4' },
    ]);

    const stored = await prisma.ttResult.findFirstOrThrow({ where: { runnerId: runner.id } });
    expect(stored.elapsedMilliseconds).toBe(1_353_400);
    expect(Number.isInteger(stored.elapsedMilliseconds)).toBe(true);
  });
});

describe('scoring versions', () => {
  it('stamps every result with the rules and age-grade versions', async () => {
    const { season } = await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Mo',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');
    await saveRoundResults(round.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '20:00' },
    ]);

    const stored = await prisma.ttResult.findFirstOrThrow({ where: { runnerId: runner.id } });
    // Written out in full rather than compared against the constant: a version
    // bump should require a deliberate edit here, which is the point of
    // stamping it in the first place.
    expect(stored.scoringRulesVersion).toBe('RMPAC_SCORING_V2');
    expect(stored.ageGradeVersion).toBe('WMA_ROAD_2015_RMPAC_V1');

    const scoring = await computeSeasonScoring(season.id, { publishedOnly: true });
    expect(scoring.scoringRulesVersion).toBe('RMPAC_SCORING_V2');
  });
});
