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
  createRunner,
  deactivateRunner,
  findDuplicateCandidates,
  listRunners,
  mergeRunnersAndRecalculate,
  normaliseSearchName,
} from '@/services/runners';
import { saveRoundResults } from '@/services/time-trials';

beforeEach(() => clearCookies());

async function setUp() {
  const admin = await createAdmin();
  await signInAs(admin.id);
  return admin;
}

describe('normaliseSearchName', () => {
  it('folds accents, case and punctuation so near-duplicates collide', () => {
    expect(normaliseSearchName('Siân', "O'Brien")).toBe('sian obrien');
    expect(normaliseSearchName('SIAN', 'OBrien')).toBe('sian obrien');
    expect(normaliseSearchName('  Sian  ', ' O Brien ')).toBe('sian o brien');
    expect(normaliseSearchName('José', 'Núñez')).toBe('jose nunez');
  });
});

describe('duplicate detection', () => {
  it('ranks a name-and-birth-date match above a name-only match', async () => {
    await setUp();
    await createRunnerRecord({
      givenName: 'Sam',
      familyName: 'Stone',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    await createRunnerRecord({
      givenName: 'Sam',
      familyName: 'Stone',
      dateOfBirth: '1975-06-06',
      category: 'MALE',
    });

    const candidates = await findDuplicateCandidates({
      givenName: 'Sam',
      familyName: 'Stone',
      dateOfBirth: '1990-01-01',
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.reason).toBe('SAME_NAME_AND_BIRTH_DATE');
    expect(candidates[1]?.reason).toBe('SAME_NAME');
  });

  it('never merges automatically — creating a same-named runner still succeeds', async () => {
    await setUp();
    await createRunnerRecord({
      givenName: 'Sam',
      familyName: 'Stone',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });

    // Two real club members can share a name; only a human decides.
    await expect(
      createRunner({
        givenName: 'Sam',
        familyName: 'Stone',
        dateOfBirth: '2001-02-03',
        category: 'MALE',
      }),
    ).resolves.toBeDefined();
    expect(await prisma.runner.count()).toBe(2);
  });

  it('excludes the record being edited', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Solo',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });

    expect(
      await findDuplicateCandidates({ givenName: 'Solo', familyName: 'Runner' }, runner.id),
    ).toEqual([]);
  });
});

describe('validation', () => {
  it('rejects a future date of birth', async () => {
    await setUp();
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);

    await expect(
      createRunner({
        givenName: 'Time',
        familyName: 'Traveller',
        dateOfBirth: nextYear.toISOString().slice(0, 10),
        category: 'MALE',
      }),
    ).rejects.toThrow(/Check the date of birth/);
  });

  it('rejects an impossible calendar date', async () => {
    await setUp();
    await expect(
      createRunner({
        givenName: 'Not',
        familyName: 'Real',
        dateOfBirth: '2001-02-30',
        category: 'MALE',
      }),
    ).rejects.toThrow(/Check the date of birth/);
  });
});

describe('deactivation', () => {
  it('keeps results intact and out of new entry lists', async () => {
    await setUp();
    const season = await createWinterSeason();
    const runner = await createRunnerRecord({
      givenName: 'Retired',
      familyName: 'Runner',
      dateOfBirth: '1970-01-01',
      category: 'MALE',
    });
    const round = await createRound(season.id, 1, '2025-10-07');
    await addResult(round.id, runner.id, '25:00');

    await deactivateRunner(runner.id);

    expect(await prisma.ttResult.count({ where: { runnerId: runner.id } })).toBe(1);
    expect((await listRunners()).map((entry) => entry.id)).not.toContain(runner.id);
    expect((await listRunners({ includeInactive: true })).map((entry) => entry.id)).toContain(
      runner.id,
    );
  });
});

describe('merging', () => {
  async function twoDuplicatesWithResults() {
    await setUp();
    const season = await createWinterSeason();

    const surviving = await createRunnerRecord({
      givenName: 'Ann',
      familyName: 'Merge',
      dateOfBirth: '1985-05-05',
      category: 'FEMALE',
    });
    const duplicate = await createRunnerRecord({
      givenName: 'Ann',
      familyName: 'Merge',
      dateOfBirth: '1985-05-05',
      category: 'FEMALE',
    });

    const roundOne = await createRound(season.id, 1, '2025-10-07');
    const roundTwo = await createRound(season.id, 2, '2025-11-04');

    await saveRoundResults(roundOne.id, [
      { runnerId: surviving.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    ]);
    await saveRoundResults(roundTwo.id, [
      { runnerId: duplicate.id, distanceChoice: 'TWO_LAP', time: '24:00' },
    ]);

    return { season, surviving, duplicate, roundOne, roundTwo };
  }

  it('moves results onto the survivor and marks the duplicate merged', async () => {
    const { surviving, duplicate } = await twoDuplicatesWithResults();

    const outcome = await mergeRunnersAndRecalculate(duplicate.id, surviving.id);

    expect(outcome.movedTimeTrialResults).toBe(1);
    expect(outcome.skippedTimeTrialResults).toBe(0);
    expect(await prisma.ttResult.count({ where: { runnerId: surviving.id } })).toBe(2);
    expect(await prisma.ttResult.count({ where: { runnerId: duplicate.id } })).toBe(0);

    const merged = await prisma.runner.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(merged.status).toBe('MERGED');
    expect(merged.canonicalRunnerId).toBe(surviving.id);
  });

  it('recalculates so the moved result gains its improvement comparison', async () => {
    const { surviving, duplicate, roundTwo } = await twoDuplicatesWithResults();

    const before = await prisma.ttResult.findFirstOrThrow({ where: { roundId: roundTwo.id } });
    // While the results belonged to two people, neither had a prior comparison.
    expect(before.previousRoundOrdinal).toBeNull();
    expect(before.improvementPoints).toBe(0);

    await mergeRunnersAndRecalculate(duplicate.id, surviving.id);

    const after = await prisma.ttResult.findFirstOrThrow({ where: { roundId: roundTwo.id } });
    // Now one person ran both rounds and got faster, so the improvement counts.
    expect(after.previousRoundOrdinal).toBe(1);
    expect(after.improvementPoints).toBe(1);
  });

  it('leaves a clashing result behind rather than overwriting the survivor', async () => {
    await setUp();
    const season = await createWinterSeason();
    const surviving = await createRunnerRecord({
      givenName: 'Bea',
      familyName: 'Clash',
      dateOfBirth: '1985-05-05',
      category: 'FEMALE',
    });
    const duplicate = await createRunnerRecord({
      givenName: 'Bea',
      familyName: 'Clash',
      dateOfBirth: '1985-05-05',
      category: 'FEMALE',
    });

    const round = await createRound(season.id, 1, '2025-10-07');
    // Both records hold a result in the same round: only one can survive the
    // uniqueness constraint, and choosing silently would be wrong.
    await addResult(round.id, surviving.id, '25:00');
    await addResult(round.id, duplicate.id, '26:00');

    const outcome = await mergeRunnersAndRecalculate(duplicate.id, surviving.id);

    expect(outcome.movedTimeTrialResults).toBe(0);
    expect(outcome.skippedTimeTrialResults).toBe(1);
    // The survivor's own result is untouched.
    const kept = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: round.id, runnerId: surviving.id },
    });
    expect(kept.elapsedMilliseconds).toBe(25 * 60 * 1000);
  });

  it('refuses to merge a runner into themselves', async () => {
    const { surviving } = await twoDuplicatesWithResults();
    await expect(mergeRunnersAndRecalculate(surviving.id, surviving.id)).rejects.toThrow(
      /two different runners/,
    );
  });

  it('refuses to enter a result for a merged runner', async () => {
    const { season, surviving, duplicate } = await twoDuplicatesWithResults();
    await mergeRunnersAndRecalculate(duplicate.id, surviving.id);

    const round = await createRound(season.id, 3, '2025-12-02');
    await expect(
      saveRoundResults(round.id, [
        { runnerId: duplicate.id, distanceChoice: 'TWO_LAP', time: '23:00' },
      ]),
    ).rejects.toThrow(/merged into another record/);
  });
});
