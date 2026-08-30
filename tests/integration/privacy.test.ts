import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCookies,
  createAdmin,
  createRound,
  createRunnerRecord,
  createWinterSeason,
  signInAs,
} from './helpers';
import { assertNoPrivateFields } from '@/lib/dto';
import {
  getHomeView,
  getPublicChampionshipView,
  getPublicRoundView,
  getPublicSeasonView,
  listPublicRaces,
} from '@/services/public-queries';
import { saveRoundResults } from '@/services/time-trials';
import { createRace, setRaceState } from '@/services/races';
import { saveRaceResults, setChampionshipState } from '@/services/championships';
import { prisma } from '@/lib/db';

/**
 * The privacy boundary, tested from the outside.
 *
 * Rather than asserting on individual fields, these tests walk the entire
 * public response graph looking for any forbidden key. That way a future
 * developer who adds a field to a public DTO gets a failing test rather than a
 * quiet data leak.
 */

const SECRET_DOB = '1988-04-05';

beforeEach(() => clearCookies());

async function buildPublishedClub() {
  const admin = await createAdmin();
  await signInAs(admin.id);

  const season = await createWinterSeason();
  const alice = await createRunnerRecord({
    givenName: 'Alice',
    familyName: 'Private',
    dateOfBirth: SECRET_DOB,
    category: 'FEMALE',
  });
  const bob = await createRunnerRecord({
    givenName: 'Bob',
    familyName: 'Private',
    dateOfBirth: '1975-11-30',
    category: 'MALE',
  });

  const roundOne = await createRound(season.id, 1, '2025-10-07', 'PUBLISHED');
  const roundTwo = await createRound(season.id, 2, '2025-11-04', 'PUBLISHED');
  await saveRoundResults(roundOne.id, [
    { runnerId: alice.id, distanceChoice: 'TWO_LAP', time: '25:00' },
    { runnerId: bob.id, distanceChoice: 'THREE_LAP', time: '35:00' },
  ]);
  await saveRoundResults(roundTwo.id, [
    { runnerId: alice.id, distanceChoice: 'TWO_LAP', time: '24:00' },
  ]);

  const race = await createRace({
    name: 'Portland Coastal 10',
    shortLabel: 'PC10',
    date: '2025-04-13',
    startTime: '10:00',
    locationName: 'Portland',
    address: '',
    mapUrl: '',
    distanceLabel: '10 km',
    distanceMetres: null,
    leagueName: 'Dorset League',
    entryInstructions: 'Enter on the day',
    externalUrl: '',
    status: 'COMPLETED',
    isChampionshipQualifier: true,
  });
  await setRaceState(race.id, 'PUBLISHED');
  await saveRaceResults(race.id, [
    { runnerId: alice.id, categoryPosition: 1 },
    { runnerId: bob.id, categoryPosition: 1 },
  ]);

  const championship = await prisma.championship.findFirstOrThrow();
  await setChampionshipState(championship.id, 'PUBLISHED');

  return { season, alice, bob, race, championship, roundOne };
}

describe('public responses carry no private field', () => {
  it('season view', async () => {
    const { season } = await buildPublishedClub();
    const view = await getPublicSeasonView(season.slug);

    expect(view).not.toBeNull();
    expect(() => assertNoPrivateFields(view)).not.toThrow();
    expect(JSON.stringify(view)).not.toContain(SECRET_DOB);
    expect(JSON.stringify(view)).not.toContain('1988');
  });

  it('round view', async () => {
    const { season, roundOne } = await buildPublishedClub();
    const view = await getPublicRoundView(season.slug, roundOne.id);

    expect(view).not.toBeNull();
    expect(() => assertNoPrivateFields(view)).not.toThrow();
    expect(JSON.stringify(view)).not.toContain(SECRET_DOB);
    // The age-graded percentage is public; the exact age behind it is not.
    expect(view?.byDistance.TWO_LAP.rows[0]?.ageGradePercent).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain('ageOnRoundDate');
  });

  it('championship view', async () => {
    await buildPublishedClub();
    const view = await getPublicChampionshipView(2025);

    expect(view).not.toBeNull();
    expect(() => assertNoPrivateFields(view)).not.toThrow();
    expect(JSON.stringify(view)).not.toContain(SECRET_DOB);
  });

  it('home view', async () => {
    await buildPublishedClub();
    const view = await getHomeView();

    expect(() => assertNoPrivateFields(view)).not.toThrow();
    expect(JSON.stringify(view)).not.toContain(SECRET_DOB);
  });

  it('race list', async () => {
    await buildPublishedClub();
    const races = await listPublicRaces();

    expect(() => assertNoPrivateFields(races)).not.toThrow();
    // Publication metadata and administrator identity stay internal.
    const serialised = JSON.stringify(races);
    expect(serialised).not.toContain('publishedById');
    expect(serialised).not.toContain('state');
  });

  it('exposes names and results, which are the things that should be public', async () => {
    const { season } = await buildPublishedClub();
    const view = await getPublicSeasonView(season.slug);
    const serialised = JSON.stringify(view);

    expect(serialised).toContain('Alice Private');
    expect(serialised).toContain('Bob Private');
    expect(view?.standings.FEMALE[0]?.bestFourTotal).toBeGreaterThan(0);
  });
});

describe('draft data has no public path', () => {
  it('a draft race is absent from the public race list', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    const race = await createRace({
      name: 'Secret Fixture',
      shortLabel: 'SEC',
      date: '2026-12-01',
      startTime: '',
      locationName: '',
      address: '',
      mapUrl: '',
      distanceLabel: '',
      distanceMetres: null,
      leagueName: '',
      entryInstructions: '',
      externalUrl: '',
      status: 'SCHEDULED',
      isChampionshipQualifier: false,
    });

    const { upcoming, past } = await listPublicRaces();
    expect([...upcoming, ...past].map((entry) => entry.name)).not.toContain('Secret Fixture');

    await setRaceState(race.id, 'PUBLISHED');
    const after = await listPublicRaces();
    expect([...after.upcoming, ...after.past].map((entry) => entry.name)).toContain(
      'Secret Fixture',
    );
  });

  it('a draft championship is not readable by year', async () => {
    const { championship } = await buildPublishedClub();
    expect(await getPublicChampionshipView(2025)).not.toBeNull();

    await setChampionshipState(championship.id, 'DRAFT');
    expect(await getPublicChampionshipView(2025)).toBeNull();
  });

  it('does not leak a draft qualifying race into a published championship table', async () => {
    const { alice, championship } = await buildPublishedClub();

    const draftRace = await createRace({
      name: 'Unpublished Qualifier',
      shortLabel: 'UNP',
      date: '2025-06-01',
      startTime: '',
      locationName: '',
      address: '',
      mapUrl: '',
      distanceLabel: '',
      distanceMetres: null,
      leagueName: '',
      entryInstructions: '',
      externalUrl: '',
      status: 'COMPLETED',
      isChampionshipQualifier: true,
    });
    await saveRaceResults(draftRace.id, [{ runnerId: alice.id, categoryPosition: 1 }]);

    const view = await getPublicChampionshipView(championship.year);
    expect(view?.races.map((race) => race.shortLabel)).not.toContain('UNP');
    expect(JSON.stringify(view)).not.toContain('Unpublished Qualifier');
  });
});

describe('the runner query itself never selects a date of birth', () => {
  it('public season and round views leave dateOfBirth out of the object graph', async () => {
    const { season, roundOne } = await buildPublishedClub();

    // Deep-walk both views looking for the key by name, not just the value, so
    // a null or undefined date of birth would still be caught.
    const seasonView = await getPublicSeasonView(season.slug);
    const roundView = await getPublicRoundView(season.slug, roundOne.id);

    for (const view of [seasonView, roundView]) {
      const keys = collectKeys(view);
      expect(keys).not.toContain('dateOfBirth');
      expect(keys).not.toContain('searchName');
      expect(keys).not.toContain('ageOnRoundDate');
    }
  });
});

function collectKeys(value: unknown, seen = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object' || value instanceof Date) return seen;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, seen);
    return seen;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    seen.add(key);
    collectKeys(entry, seen);
  }
  return seen;
}
