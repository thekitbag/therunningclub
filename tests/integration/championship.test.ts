import { beforeEach, describe, expect, it } from 'vitest';
import { clearCookies, createAdmin, createRunnerRecord, signInAs } from './helpers';
import { prisma } from '@/lib/db';
import { createRace, setRaceState, updateRace } from '@/services/races';
import {
  computeChampionshipScoring,
  previewChampionshipImpact,
  saveRaceResults,
  setChampionshipState,
} from '@/services/championships';
import { getPublicChampionshipView } from '@/services/public-queries';
import { ServiceError } from '@/services/errors';

beforeEach(() => clearCookies());

const raceInput = (overrides: Partial<Parameters<typeof createRace>[0]> = {}) => ({
  name: 'Test Race',
  shortLabel: 'TR',
  date: '2025-05-11',
  startTime: '',
  locationName: '',
  address: '',
  mapUrl: '',
  distanceLabel: '',
  distanceMetres: null,
  leagueName: '',
  entryInstructions: '',
  externalUrl: '',
  status: 'COMPLETED' as const,
  isChampionshipQualifier: true,
  ...overrides,
});

async function setUp() {
  const admin = await createAdmin();
  await signInAs(admin.id);
  return admin;
}

describe('qualifying races', () => {
  it('creates the calendar-year championship on the first qualifier', async () => {
    await setUp();
    expect(await prisma.championship.count()).toBe(0);

    await createRace(raceInput({ date: '2025-05-11' }));

    const championships = await prisma.championship.findMany();
    expect(championships).toHaveLength(1);
    expect(championships[0]?.year).toBe(2025);
    expect(championships[0]?.state).toBe('DRAFT');
  });

  it('reuses the same championship for later races in the same year', async () => {
    await setUp();
    await createRace(raceInput({ name: 'First', shortLabel: 'F1', date: '2025-03-01' }));
    await createRace(raceInput({ name: 'Second', shortLabel: 'F2', date: '2025-09-01' }));

    expect(await prisma.championship.count()).toBe(1);
    expect(await prisma.race.count({ where: { isChampionshipQualifier: true } })).toBe(2);
  });

  it('creates separate championships per calendar year', async () => {
    await setUp();
    await createRace(raceInput({ name: 'A', shortLabel: 'A', date: '2025-03-01' }));
    await createRace(raceInput({ name: 'B', shortLabel: 'B', date: '2026-03-01' }));

    const years = (await prisma.championship.findMany({ orderBy: { year: 'asc' } })).map(
      (championship) => championship.year,
    );
    expect(years).toEqual([2025, 2026]);
  });

  it('gives every race a unique slug even with the same name and year', async () => {
    await setUp();
    const first = await createRace(raceInput({ name: 'Coastal 10', shortLabel: 'C1' }));
    const second = await createRace(raceInput({ name: 'Coastal 10', shortLabel: 'C2' }));
    expect(first.slug).not.toBe(second.slug);
  });

  it('refuses to remove qualifier status while placings exist', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Ann',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });
    const race = await createRace(raceInput());
    await saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: 1 }]);

    await expect(
      updateRace(race.id, raceInput({ isChampionshipQualifier: false })),
    ).rejects.toThrow(/Remove them before turning off qualifier status/);

    // Clearing the placings first makes it succeed.
    await saveRaceResults(race.id, []);
    await expect(
      updateRace(race.id, raceInput({ isChampionshipQualifier: false })),
    ).resolves.toBeDefined();
  });

  it('rejects a non-http external URL, and says so on the right field', async () => {
    await setUp();

    // These would otherwise become real anchors with target="_blank", turning a
    // compromised admin account into script execution for every visitor.
    for (const [field, value] of [
      ['externalUrl', 'javascript:alert(1)'],
      ['mapUrl', 'data:text/html,<script>'],
      ['externalUrl', 'file:///etc/passwd'],
    ] as const) {
      try {
        await createRace(raceInput({ [field]: value }));
        expect.unreachable(`expected ${value} to be rejected`);
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        expect((error as ServiceError).fieldErrors[field], value).toMatch(/full web address/);
      }
    }

    // A normal https link is still accepted.
    await expect(
      createRace(raceInput({ externalUrl: 'https://example.com/race' })),
    ).resolves.toBeDefined();
  });
});

describe('placings', () => {
  it('replaces the whole set on each save', async () => {
    await setUp();
    const first = await createRunnerRecord({
      givenName: 'First',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const second = await createRunnerRecord({
      givenName: 'Second',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const race = await createRace(raceInput());

    await saveRaceResults(race.id, [
      { runnerId: first.id, categoryPosition: 1 },
      { runnerId: second.id, categoryPosition: 2 },
    ]);
    expect(await prisma.championshipResult.count()).toBe(2);

    await saveRaceResults(race.id, [{ runnerId: second.id, categoryPosition: 1 }]);
    expect(await prisma.championshipResult.count()).toBe(1);
    expect((await prisma.championshipResult.findFirstOrThrow()).runnerId).toBe(second.id);
  });

  it('takes the category from the runner record, not the form', async () => {
    await setUp();
    const woman = await createRunnerRecord({
      givenName: 'Wendy',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'FEMALE',
    });
    const race = await createRace(raceInput());
    await saveRaceResults(race.id, [{ runnerId: woman.id, categoryPosition: 1 }]);

    const stored = await prisma.championshipResult.findFirstOrThrow();
    expect(stored.category).toBe('FEMALE');
    expect(stored.score).toBe(stored.categoryPosition);
  });

  it('refuses placings on a race that is not a qualifier', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Nick',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const race = await createRace(raceInput({ isChampionshipQualifier: false }));

    await expect(
      saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: 1 }]),
    ).rejects.toThrow(/not marked as a championship qualifier/);
  });

  it('rejects a duplicate runner in one race', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Dup',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const race = await createRace(raceInput());

    await expect(
      saveRaceResults(race.id, [
        { runnerId: runner.id, categoryPosition: 1 },
        { runnerId: runner.id, categoryPosition: 2 },
      ]),
    ).rejects.toThrow(/only appear once/);
  });

  it('rejects a position below 1 or a non-number', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Bad',
      familyName: 'Runner',
      dateOfBirth: '1990-01-01',
      category: 'MALE',
    });
    const race = await createRace(raceInput());

    await expect(
      saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: 0 }]),
    ).rejects.toThrow(/Check row 1/);
    await expect(
      saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: 'first' }]),
    ).rejects.toThrow(/Check row 1/);
  });
});

describe('championship standings end to end', () => {
  /** Six qualifying races with one runner placing in every one of them. */
  async function sixRaceChampionship() {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Steady',
      familyName: 'Runner',
      dateOfBirth: '1985-01-01',
      category: 'MALE',
    });

    const positions = [1, 2, 3, 4, 5, 9];
    for (const [index, position] of positions.entries()) {
      const race = await createRace(
        raceInput({
          name: `Race ${index + 1}`,
          shortLabel: `R${index + 1}`,
          date: `2025-0${index + 1}-15`,
        }),
      );
      await setRaceState(race.id, 'PUBLISHED');
      await saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: position }]);
    }

    const championship = await prisma.championship.findFirstOrThrow();
    await setChampionshipState(championship.id, 'PUBLISHED');
    return { runner, championship };
  }

  it('makes a runner eligible on their sixth race and totals the six lowest', async () => {
    const { championship } = await sixRaceChampionship();

    const view = await getPublicChampionshipView(championship.year);
    const standing = view?.standings.MALE[0];

    expect(standing?.eligible).toBe(true);
    expect(standing?.racesCompleted).toBe(6);
    // 1 + 2 + 3 + 4 + 5 + 9 — every race counts because there are exactly six.
    expect(standing?.bestSixTotal).toBe(24);
    expect(standing?.position).toBe(1);
  });

  it('drops the worst score once a seventh race is added', async () => {
    const { runner, championship } = await sixRaceChampionship();

    const seventh = await createRace(
      raceInput({ name: 'Race 7', shortLabel: 'R7', date: '2025-07-15' }),
    );
    await setRaceState(seventh.id, 'PUBLISHED');
    await saveRaceResults(seventh.id, [{ runnerId: runner.id, categoryPosition: 2 }]);

    const view = await getPublicChampionshipView(championship.year);
    const standing = view?.standings.MALE[0];

    expect(standing?.racesCompleted).toBe(7);
    // The 9 is dropped in favour of the new 2: 1 + 2 + 2 + 3 + 4 + 5.
    expect(standing?.bestSixTotal).toBe(17);
    expect(standing?.races.filter((race) => race.counts)).toHaveLength(6);
  });

  it('correcting a placing recalculates the total', async () => {
    const { championship } = await sixRaceChampionship();

    const races = await prisma.race.findMany({ orderBy: { date: 'asc' } });
    const lastRace = races[races.length - 1]!;
    const existing = await prisma.championshipResult.findFirstOrThrow({
      where: { raceId: lastRace.id },
    });

    await saveRaceResults(lastRace.id, [{ runnerId: existing.runnerId, categoryPosition: 1 }]);

    const view = await getPublicChampionshipView(championship.year);
    // The 9 became a 1: 24 - 9 + 1.
    expect(view?.standings.MALE[0]?.bestSixTotal).toBe(16);
  });
});

describe('championship impact preview', () => {
  it('reports the difference between public and draft data without writing', async () => {
    await setUp();
    const runner = await createRunnerRecord({
      givenName: 'Preview',
      familyName: 'Runner',
      dateOfBirth: '1985-01-01',
      category: 'MALE',
    });

    // Five published races, then a sixth left as a draft.
    for (let index = 0; index < 5; index += 1) {
      const race = await createRace(
        raceInput({ name: `Pub ${index}`, shortLabel: `P${index}`, date: `2025-0${index + 1}-10` }),
      );
      await setRaceState(race.id, 'PUBLISHED');
      await saveRaceResults(race.id, [{ runnerId: runner.id, categoryPosition: 2 }]);
    }
    const draftRace = await createRace(
      raceInput({ name: 'Draft', shortLabel: 'DR', date: '2025-06-10' }),
    );
    await saveRaceResults(draftRace.id, [{ runnerId: runner.id, categoryPosition: 2 }]);

    const championship = await prisma.championship.findFirstOrThrow();
    const impact = await previewChampionshipImpact(championship.id);

    const change = impact.changedRunners[0];
    expect(change?.runnerName).toBe('Preview Runner');
    expect(change?.fromEligible).toBe(false);
    // Publishing the sixth race is what tips them over the eligibility line.
    expect(change?.toEligible).toBe(true);
    expect(change?.toTotal).toBe(12);

    // Draft-inclusive scoring differs from the published picture.
    const publicView = await computeChampionshipScoring(championship.id, { publishedOnly: true });
    expect(publicView.standings.MALE[0]?.eligible).toBe(false);
    expect((await prisma.race.findUniqueOrThrow({ where: { id: draftRace.id } })).state).toBe(
      'DRAFT',
    );
  });
});
