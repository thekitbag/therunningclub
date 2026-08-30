import { prisma } from '@/lib/db';
import { toPublicRunner, type PublicRunner } from '@/lib/dto';
import { todayCalendar } from '@/lib/dates';
import { computeSeasonScoring } from './time-trials';
import { computeChampionshipScoring } from './championships';
import type {
  ChampionshipStanding,
  ScoredResult,
  SeasonStanding,
  SeasonType,
} from '@/domain/scoring';

/**
 * Read models for the public site.
 *
 * Every function here returns a shape assembled by hand from named fields.
 * Nothing in this file selects a whole Prisma entity and hands it to a page,
 * which is what keeps dates of birth, draft records, publication metadata and
 * administrator identities off the public surface by construction.
 *
 * All of these queries filter to `PUBLISHED` state. Draft data has no path to a
 * public page because the public page has no way to ask for it.
 */

export interface PublicSeasonSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: SeasonType;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly clubYearLabel: string;
  readonly twoLapMetres: number;
  readonly threeLapMetres: number;
  readonly lastUpdatedAt: Date;
}

export interface PublicRoundSummary {
  readonly id: string;
  readonly ordinal: number;
  readonly name: string;
  readonly date: Date;
  readonly published: boolean;
  readonly resultCount: number;
}

export interface PublicSeasonResultRow {
  readonly runner: PublicRunner;
  readonly position: number;
  readonly elapsedMilliseconds: number;
  readonly finishingPoints: number;
  readonly tiedOnTime: boolean;
  readonly ageGradePercent: number | null;
  readonly previousAgeGradePercent: number | null;
  readonly improvement: number | null;
  readonly improvementPoints: number;
  readonly roundTotal: number;
  readonly hasComparableResult: boolean;
}

export interface PublicStandingRow {
  readonly runner: PublicRunner;
  readonly position: number;
  readonly tied: boolean;
  readonly rounds: readonly { ordinal: number; total: number | null; counts: boolean }[];
  readonly roundsCompleted: number;
  readonly bestFourTotal: number;
}

export interface PublicSeasonView {
  readonly season: PublicSeasonSummary;
  readonly rounds: readonly PublicRoundSummary[];
  readonly standings: Readonly<Record<'MALE' | 'FEMALE', readonly PublicStandingRow[]>>;
  readonly progression: readonly {
    runner: PublicRunner;
    points: readonly { ordinal: number; ageGradePercent: number | null }[];
  }[];
}

/** Every published season, newest first, for the archive selector. */
export async function listPublishedSeasons(): Promise<PublicSeasonSummary[]> {
  const seasons = await prisma.ttSeason.findMany({
    where: { state: { in: ['PUBLISHED', 'ARCHIVED'] } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      startDate: true,
      endDate: true,
      clubYearLabel: true,
      twoLapMetres: true,
      threeLapMetres: true,
      updatedAt: true,
    },
  });

  return seasons.map((season) => ({
    id: season.id,
    name: season.name,
    slug: season.slug,
    type: season.type,
    startDate: season.startDate,
    endDate: season.endDate,
    clubYearLabel: season.clubYearLabel,
    twoLapMetres: season.twoLapMetres,
    threeLapMetres: season.threeLapMetres,
    lastUpdatedAt: season.updatedAt,
  }));
}

/**
 * The season a visitor should land on.
 *
 * Prefers a published season whose date range contains today, so the site
 * defaults to "what is happening now". Falls back to the most recent published
 * season out of competition periods.
 */
export async function findCurrentSeasonSlug(): Promise<string | null> {
  const today = todayCalendar();
  const inProgress = await prisma.ttSeason.findFirst({
    where: {
      state: { in: ['PUBLISHED', 'ARCHIVED'] },
      startDate: { lte: today },
      endDate: { gte: today },
    },
    orderBy: { startDate: 'desc' },
    select: { slug: true },
  });
  if (inProgress) return inProgress.slug;

  const mostRecent = await prisma.ttSeason.findFirst({
    where: { state: { in: ['PUBLISHED', 'ARCHIVED'] } },
    orderBy: { startDate: 'desc' },
    select: { slug: true },
  });
  return mostRecent?.slug ?? null;
}

export async function getPublicSeasonView(slug: string): Promise<PublicSeasonView | null> {
  const season = await prisma.ttSeason.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      state: true,
      startDate: true,
      endDate: true,
      clubYearLabel: true,
      twoLapMetres: true,
      threeLapMetres: true,
      updatedAt: true,
      rounds: {
        orderBy: { ordinal: 'asc' },
        select: {
          id: true,
          ordinal: true,
          name: true,
          date: true,
          state: true,
          _count: { select: { results: true } },
        },
      },
    },
  });

  if (!season || season.state === 'DRAFT') return null;

  // Published-only: a draft round inside a published season stays invisible.
  const scoring = await computeSeasonScoring(season.id, { publishedOnly: true });
  const runners = await loadPublicRunners(
    scoring.rounds.flatMap((round) => round.results.map((result) => result.runnerId)),
  );

  const toStandingRow = (standing: SeasonStanding): PublicStandingRow | null => {
    const runner = runners.get(standing.runnerId);
    if (!runner) return null;
    return {
      runner,
      position: standing.position,
      tied: standing.tied,
      rounds: standing.rounds.map((round) => ({
        ordinal: round.ordinal,
        total: round.total,
        counts: round.counts,
      })),
      roundsCompleted: standing.roundsCompleted,
      bestFourTotal: standing.bestFourTotal,
    };
  };

  const progression = [...runners.values()]
    .map((runner) => ({
      runner,
      points: scoring.rounds
        .filter((round) => round.published)
        .map((round) => ({
          ordinal: round.roundOrdinal,
          ageGradePercent:
            round.results.find((result) => result.runnerId === runner.id)?.ageGradePercent ?? null,
        })),
    }))
    .filter((entry) => entry.points.some((point) => point.ageGradePercent !== null))
    .sort((a, b) => a.runner.displayName.localeCompare(b.runner.displayName));

  return {
    season: {
      id: season.id,
      name: season.name,
      slug: season.slug,
      type: season.type,
      startDate: season.startDate,
      endDate: season.endDate,
      clubYearLabel: season.clubYearLabel,
      twoLapMetres: season.twoLapMetres,
      threeLapMetres: season.threeLapMetres,
      lastUpdatedAt: season.updatedAt,
    },
    rounds: season.rounds.map((round) => ({
      id: round.id,
      ordinal: round.ordinal,
      name: round.name,
      date: round.date,
      published: round.state === 'PUBLISHED',
      resultCount: round.state === 'PUBLISHED' ? round._count.results : 0,
    })),
    standings: {
      MALE: scoring.standings.MALE.map(toStandingRow).filter(isPresent),
      FEMALE: scoring.standings.FEMALE.map(toStandingRow).filter(isPresent),
    },
    progression,
  };
}

export interface PublicRoundView {
  readonly season: PublicSeasonSummary;
  readonly round: PublicRoundSummary;
  readonly improverCount: number;
  readonly byDistance: Readonly<
    Record<'TWO_LAP' | 'THREE_LAP', { metres: number; rows: readonly PublicSeasonResultRow[] }>
  >;
}

export async function getPublicRoundView(
  seasonSlug: string,
  roundId: string,
): Promise<PublicRoundView | null> {
  const season = await prisma.ttSeason.findUnique({
    where: { slug: seasonSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      state: true,
      startDate: true,
      endDate: true,
      clubYearLabel: true,
      twoLapMetres: true,
      threeLapMetres: true,
      updatedAt: true,
    },
  });
  if (!season || season.state === 'DRAFT') return null;

  const round = await prisma.ttRound.findFirst({
    where: { id: roundId, seasonId: season.id, state: 'PUBLISHED' },
    select: {
      id: true,
      ordinal: true,
      name: true,
      date: true,
      updatedAt: true,
      _count: { select: { results: true } },
    },
  });
  if (!round) return null;

  const scoring = await computeSeasonScoring(season.id, { publishedOnly: true });
  const scoredRound = scoring.rounds.find((candidate) => candidate.roundId === round.id);
  if (!scoredRound) return null;

  const runners = await loadPublicRunners(scoredRound.results.map((result) => result.runnerId));

  const toRow = (result: ScoredResult): PublicSeasonResultRow | null => {
    const runner = runners.get(result.runnerId);
    if (!runner) return null;
    return {
      runner,
      position: result.finishingPosition,
      elapsedMilliseconds: result.elapsedMilliseconds,
      finishingPoints: result.finishingPoints,
      tiedOnTime: result.tiedOnTime,
      ageGradePercent: result.ageGradeDisplayPercent,
      previousAgeGradePercent:
        result.previousAgeGradePercent === null
          ? null
          : Math.round(result.previousAgeGradePercent * 100) / 100,
      improvement: result.improvementDisplay,
      improvementPoints: result.improvementPoints,
      roundTotal: result.roundTotal,
      hasComparableResult: result.previousAgeGradePercent !== null,
      // `ageOnRoundDate` is deliberately not carried through: an exact age is
      // as identifying as the date of birth it came from.
    };
  };

  const rowsFor = (choice: 'TWO_LAP' | 'THREE_LAP') =>
    scoredRound.results
      .filter((result) => result.distanceChoice === choice)
      .sort(
        (a, b) =>
          a.finishingPosition - b.finishingPosition ||
          a.elapsedMilliseconds - b.elapsedMilliseconds,
      )
      .map(toRow)
      .filter(isPresent);

  return {
    season: {
      id: season.id,
      name: season.name,
      slug: season.slug,
      type: season.type,
      startDate: season.startDate,
      endDate: season.endDate,
      clubYearLabel: season.clubYearLabel,
      twoLapMetres: season.twoLapMetres,
      threeLapMetres: season.threeLapMetres,
      lastUpdatedAt: season.updatedAt,
    },
    round: {
      id: round.id,
      ordinal: round.ordinal,
      name: round.name,
      date: round.date,
      published: true,
      resultCount: round._count.results,
    },
    improverCount: scoredRound.improverCount,
    byDistance: {
      TWO_LAP: { metres: season.twoLapMetres, rows: rowsFor('TWO_LAP') },
      THREE_LAP: { metres: season.threeLapMetres, rows: rowsFor('THREE_LAP') },
    },
  };
}

// ---------------------------------------------------------------------------
// Championship
// ---------------------------------------------------------------------------

export interface PublicChampionshipRow {
  readonly runner: PublicRunner;
  readonly position: number | null;
  readonly tied: boolean;
  readonly eligible: boolean;
  readonly racesCompleted: number;
  readonly racesRequired: number;
  readonly countingTotal: number | null;
  readonly races: readonly {
    raceId: string;
    shortLabel: string;
    score: number | null;
    counts: boolean;
    tied: boolean;
  }[];
}

export interface PublicChampionshipView {
  readonly year: number;
  readonly name: string;
  readonly lastUpdatedAt: Date;
  readonly races: readonly {
    id: string;
    shortLabel: string;
    name: string;
    date: Date;
    slug: string;
  }[];
  readonly standings: Readonly<Record<'MALE' | 'FEMALE', readonly PublicChampionshipRow[]>>;
}

export async function listPublishedChampionshipYears(): Promise<number[]> {
  const championships = await prisma.championship.findMany({
    where: { state: { in: ['PUBLISHED', 'ARCHIVED'] } },
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  return championships.map((championship) => championship.year);
}

export async function getPublicChampionshipView(
  year: number,
): Promise<PublicChampionshipView | null> {
  const championship = await prisma.championship.findUnique({
    where: { year },
    select: { id: true, year: true, name: true, state: true, updatedAt: true },
  });
  if (!championship || championship.state === 'DRAFT') return null;

  const scoring = await computeChampionshipScoring(championship.id, { publishedOnly: true });

  const raceRecords = await prisma.race.findMany({
    where: { id: { in: scoring.races.map((race) => race.raceId) } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(raceRecords.map((race) => [race.id, race.slug]));

  const runnerIds = [
    ...scoring.standings.MALE.map((standing) => standing.runnerId),
    ...scoring.standings.FEMALE.map((standing) => standing.runnerId),
  ];
  const runners = await loadPublicRunners(runnerIds);

  const toRow = (standing: ChampionshipStanding): PublicChampionshipRow | null => {
    const runner = runners.get(standing.runnerId);
    if (!runner) return null;
    return {
      runner,
      position: standing.position,
      tied: standing.tied,
      eligible: standing.eligible,
      racesCompleted: standing.racesCompleted,
      racesRequired: standing.racesRequired,
      countingTotal: standing.countingTotal,
      races: standing.races.map((race) => ({
        raceId: race.raceId,
        shortLabel: race.shortLabel,
        score: race.score,
        counts: race.counts,
        tied: race.tied,
      })),
    };
  };

  return {
    year: championship.year,
    name: championship.name,
    lastUpdatedAt: championship.updatedAt,
    races: scoring.races.map((race) => ({
      id: race.raceId,
      shortLabel: race.shortLabel,
      name: race.name,
      date: race.date,
      slug: slugById.get(race.raceId) ?? '',
    })),
    standings: {
      MALE: scoring.standings.MALE.map(toRow).filter(isPresent),
      FEMALE: scoring.standings.FEMALE.map(toRow).filter(isPresent),
    },
  };
}

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

export interface PublicRace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly date: Date;
  readonly startTime: string | null;
  readonly locationName: string | null;
  readonly address: string | null;
  readonly mapUrl: string | null;
  readonly distanceLabel: string | null;
  readonly leagueName: string | null;
  readonly entryInstructions: string | null;
  readonly externalUrl: string | null;
  readonly status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
  readonly isChampionshipQualifier: boolean;
  readonly championshipYear: number | null;
  readonly hasChampionshipResults: boolean;
}

const publicRaceSelect = {
  id: true,
  slug: true,
  name: true,
  shortLabel: true,
  date: true,
  startTime: true,
  locationName: true,
  address: true,
  mapUrl: true,
  distanceLabel: true,
  leagueName: true,
  entryInstructions: true,
  externalUrl: true,
  status: true,
  isChampionshipQualifier: true,
  championship: { select: { year: true, state: true } },
  _count: { select: { championshipResults: true } },
} as const;

type RaceRecord = {
  id: string;
  slug: string;
  name: string;
  shortLabel: string;
  date: Date;
  startTime: string | null;
  locationName: string | null;
  address: string | null;
  mapUrl: string | null;
  distanceLabel: string | null;
  leagueName: string | null;
  entryInstructions: string | null;
  externalUrl: string | null;
  status: PublicRace['status'];
  isChampionshipQualifier: boolean;
  championship: { year: number; state: string } | null;
  _count: { championshipResults: number };
};

function toPublicRace(race: RaceRecord): PublicRace {
  return {
    id: race.id,
    slug: race.slug,
    name: race.name,
    shortLabel: race.shortLabel,
    date: race.date,
    startTime: race.startTime,
    locationName: race.locationName,
    address: race.address,
    mapUrl: race.mapUrl,
    distanceLabel: race.distanceLabel,
    leagueName: race.leagueName,
    entryInstructions: race.entryInstructions,
    externalUrl: race.externalUrl,
    status: race.status,
    isChampionshipQualifier: race.isChampionshipQualifier,
    // Only link on to a championship a visitor can actually see.
    championshipYear:
      race.championship && race.championship.state !== 'DRAFT' ? race.championship.year : null,
    hasChampionshipResults: race._count.championshipResults > 0,
  };
}

export interface PublicRaceLists {
  readonly upcoming: readonly PublicRace[];
  readonly past: readonly PublicRace[];
}

export async function listPublicRaces(): Promise<PublicRaceLists> {
  const today = todayCalendar();
  const races = await prisma.race.findMany({
    where: { state: 'PUBLISHED' },
    orderBy: { date: 'asc' },
    select: publicRaceSelect,
  });

  const mapped = races.map((race) => toPublicRace(race as RaceRecord));
  return {
    // A cancelled or postponed race stays in the upcoming list until its date
    // passes, because that is when members still need to see the change.
    upcoming: mapped.filter((race) => race.date.getTime() >= today.getTime()),
    past: mapped.filter((race) => race.date.getTime() < today.getTime()).reverse(),
  };
}

export async function getNextRace(): Promise<PublicRace | null> {
  const today = todayCalendar();
  const race = await prisma.race.findFirst({
    where: {
      state: 'PUBLISHED',
      date: { gte: today },
      status: { in: ['SCHEDULED', 'POSTPONED'] },
    },
    orderBy: { date: 'asc' },
    select: publicRaceSelect,
  });
  return race ? toPublicRace(race as RaceRecord) : null;
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export interface HomeLeader {
  readonly runner: PublicRunner;
  readonly value: number;
  readonly detail: string;
}

export interface HomeView {
  readonly nextRace: PublicRace | null;
  readonly latestRound: {
    readonly seasonSlug: string;
    readonly seasonName: string;
    readonly roundId: string;
    readonly ordinal: number;
    readonly date: Date;
    readonly resultCount: number;
  } | null;
  readonly timeTrialLeaders: Readonly<Record<'MALE' | 'FEMALE', HomeLeader | null>>;
  readonly championshipLeaders: Readonly<Record<'MALE' | 'FEMALE', HomeLeader | null>>;
  readonly championshipYear: number | null;
  readonly championshipEarlySeason: boolean;
  readonly timeTrialSeasonSlug: string | null;
  readonly lastUpdatedAt: Date | null;
}

export async function getHomeView(): Promise<HomeView> {
  const [nextRace, seasonSlug, championshipYears] = await Promise.all([
    getNextRace(),
    findCurrentSeasonSlug(),
    listPublishedChampionshipYears(),
  ]);

  const seasonView = seasonSlug ? await getPublicSeasonView(seasonSlug) : null;

  const latestPublishedRound = seasonView
    ? [...seasonView.rounds]
        .filter((round) => round.published)
        .sort((a, b) => b.ordinal - a.ordinal)[0]
    : undefined;

  const timeTrialLeaders = {
    MALE: leaderFrom(seasonView?.standings.MALE),
    FEMALE: leaderFrom(seasonView?.standings.FEMALE),
  };

  const championshipYear = championshipYears[0] ?? null;
  const championshipView = championshipYear
    ? await getPublicChampionshipView(championshipYear)
    : null;

  const championshipLeaders = {
    MALE: championshipLeaderFrom(championshipView?.standings.MALE),
    FEMALE: championshipLeaderFrom(championshipView?.standings.FEMALE),
  };

  return {
    nextRace,
    latestRound:
      seasonView && latestPublishedRound
        ? {
            seasonSlug: seasonView.season.slug,
            seasonName: seasonView.season.name,
            roundId: latestPublishedRound.id,
            ordinal: latestPublishedRound.ordinal,
            date: latestPublishedRound.date,
            resultCount: latestPublishedRound.resultCount,
          }
        : null,
    timeTrialLeaders,
    championshipLeaders,
    championshipYear,
    // "Nobody is eligible yet" is a real, expected early-season state rather
    // than an error or an empty table.
    championshipEarlySeason:
      championshipView !== null && !championshipLeaders.MALE && !championshipLeaders.FEMALE,
    timeTrialSeasonSlug: seasonView?.season.slug ?? null,
    lastUpdatedAt: seasonView?.season.lastUpdatedAt ?? championshipView?.lastUpdatedAt ?? null,
  };
}

function leaderFrom(standings: readonly PublicStandingRow[] | undefined): HomeLeader | null {
  const leader = standings?.find((standing) => standing.position === 1);
  if (!leader) return null;
  return {
    runner: leader.runner,
    value: leader.bestFourTotal,
    detail: `${leader.bestFourTotal} points from ${leader.roundsCompleted} round${
      leader.roundsCompleted === 1 ? '' : 's'
    }`,
  };
}

function championshipLeaderFrom(
  standings: readonly PublicChampionshipRow[] | undefined,
): HomeLeader | null {
  const leader = standings?.find((standing) => standing.position === 1 && standing.eligible);
  if (!leader || leader.countingTotal === null) return null;
  return {
    runner: leader.runner,
    value: leader.countingTotal,
    detail: `${leader.countingTotal} points from ${leader.racesCompleted} races`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadPublicRunners(ids: readonly string[]): Promise<Map<string, PublicRunner>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const runners = await prisma.runner.findMany({
    where: { id: { in: unique } },
    // Only the four fields the public DTO needs. `dateOfBirth` is not selected,
    // so it never even reaches the server-side object graph for a public page.
    select: { id: true, givenName: true, familyName: true, category: true },
  });

  return new Map(runners.map((runner) => [runner.id, toPublicRunner(runner)]));
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
