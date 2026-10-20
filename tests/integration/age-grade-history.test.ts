import { beforeEach, describe, expect, it } from 'vitest';
import {
  addResult,
  clearCookies,
  createAdmin,
  createRound,
  createRunnerRecord,
  createWinterSeason,
  signInAs,
  utc,
} from './helpers';
import { prisma } from '@/lib/db';
import {
  createSeason,
  recalculateSeasonAndFollowing,
  saveRoundResults,
} from '@/services/time-trials';
import { importAgeGradeBaselines } from '@/services/age-grade-baselines';

beforeEach(() => clearCookies());

async function signIn() {
  const admin = await createAdmin();
  await signInAs(admin.id);
}

describe('cross-season age-grade history', () => {
  it('compares with the latest published result across season and lap choice', async () => {
    await signIn();
    const runner = await createRunnerRecord({
      givenName: 'Alex',
      familyName: 'History',
      dateOfBirth: '1980-01-01',
      category: 'MALE',
    });
    const winter = await createWinterSeason();
    const winterRound = await createRound(winter.id, 6, '2026-03-03');
    const winterResult = await addResult(winterRound.id, runner.id, '20:00', 'TWO_LAP');

    const summer = await createSeason({
      name: 'Summer 2026 history',
      type: 'SUMMER',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    });
    const summerRound = await createRound(summer.id, 1, '2026-04-07');
    await addResult(summerRound.id, runner.id, '31:00', 'THREE_LAP');

    await recalculateSeasonAndFollowing(winter.id);

    const summerResult = await prisma.ttResult.findFirstOrThrow({
      where: { roundId: summerRound.id, runnerId: runner.id },
    });
    const rescoredWinterResult = await prisma.ttResult.findUniqueOrThrow({
      where: { id: winterResult.id },
    });
    expect(summerResult.previousResultId).toBe(winterResult.id);
    expect(Number(summerResult.previousAgeGradePercent)).toBe(
      Number(rescoredWinterResult.ageGradePercent),
    );
  });

  it('recalculates later seasons after an older result changes', async () => {
    await signIn();
    const runner = await createRunnerRecord({
      givenName: 'Casey',
      familyName: 'Cascade',
      dateOfBirth: '1985-01-01',
      category: 'FEMALE',
    });
    const winter = await createWinterSeason();
    const winterRound = await createRound(winter.id, 6, '2026-03-03');
    await addResult(winterRound.id, runner.id, '25:00');

    const summer = await createSeason({
      name: 'Summer 2026 cascade',
      type: 'SUMMER',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    });
    const summerRound = await createRound(summer.id, 1, '2026-04-07');
    await addResult(summerRound.id, runner.id, '30:00');
    await recalculateSeasonAndFollowing(winter.id);

    const before = await prisma.ttResult.findFirstOrThrow({ where: { roundId: summerRound.id } });
    await saveRoundResults(winterRound.id, [
      { runnerId: runner.id, distanceChoice: 'TWO_LAP', time: '24:00' },
    ]);
    const after = await prisma.ttResult.findFirstOrThrow({ where: { roundId: summerRound.id } });

    expect(Number(after.previousAgeGradePercent)).toBeGreaterThan(
      Number(before.previousAgeGradePercent),
    );
    expect(Number(after.improvement)).toBeLessThan(Number(before.improvement));
  });
});

describe('historical opening age-grade import', () => {
  it('imports a baseline and seeds the first managed result', async () => {
    await signIn();
    const runner = await createRunnerRecord({
      givenName: 'Dana',
      familyName: 'Baseline',
      dateOfBirth: '1980-01-01',
      category: 'FEMALE',
    });
    const season = await createWinterSeason();
    const round = await createRound(season.id, 1, '2025-10-07');
    await addResult(round.id, runner.id, '25:00');

    const outcome = await importAgeGradeBaselines({
      recordedOn: '2025-09-01',
      sourceLabel: 'Previous club workbook',
      csv: 'Runner name,Previous age grade\n"Baseline, Dana",55.5%\n',
    });

    expect(outcome).toMatchObject({ imported: 1, created: 1, updated: 0 });
    const baseline = await prisma.ttAgeGradeBaseline.findUniqueOrThrow({
      where: { runnerId: runner.id },
    });
    expect(Number(baseline.ageGradePercent)).toBe(55.5);
    expect(baseline.recordedOn).toEqual(utc('2025-09-01'));

    const result = await prisma.ttResult.findFirstOrThrow({ where: { roundId: round.id } });
    expect(Number(result.previousAgeGradePercent)).toBe(55.5);
    expect(result.previousResultId).toBeNull();
    expect(result.calculationTrace).toMatchObject({
      improvementBasis: 'Compared with historical opening age grade',
    });
  });

  it('rejects the whole CSV when any runner cannot be matched', async () => {
    await signIn();
    await createRunnerRecord({
      givenName: 'Erin',
      familyName: 'Known',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });

    await expect(
      importAgeGradeBaselines({
        recordedOn: '2025-09-01',
        csv: 'Runner name,Previous age grade\nErin Known,60\nUnknown Runner,50\n',
      }),
    ).rejects.toThrow(/Nothing was imported/);
    expect(await prisma.ttAgeGradeBaseline.count()).toBe(0);
  });

  it('rejects a baseline dated on or after the first managed result', async () => {
    await signIn();
    const runner = await createRunnerRecord({
      givenName: 'Fran',
      familyName: 'Dated',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });
    const season = await createWinterSeason();
    const round = await createRound(season.id, 1, '2025-10-07');
    await addResult(round.id, runner.id, '25:00');

    await expect(
      importAgeGradeBaselines({
        recordedOn: '2025-10-07',
        csv: 'Runner name,Previous age grade\nFran Dated,60\n',
      }),
    ).rejects.toThrow(/baseline date must be earlier/);
  });
});
