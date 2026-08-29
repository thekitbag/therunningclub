/**
 * Development sample data.
 *
 * Everything created here is unmistakably labelled as sample data: every runner
 * carries the "(SAMPLE)" surname suffix and every season, race and championship
 * name says so too. That labelling is deliberate — a half-remembered demo
 * database that looks like real club results is worse than an empty one.
 *
 * The command refuses to run in production, and refuses to run at all unless
 * ALLOW_SAMPLE_SEED=true, so it cannot be triggered by accident during a deploy.
 *
 * Usage:  ALLOW_SAMPLE_SEED=true npm run seed:sample
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { hashPassword, storedParametersToJson } from '../src/lib/password';
import {
  AGE_GRADE_VERSION,
  SCORING_RULES_VERSION,
  SEASON_DISTANCES,
  parseElapsedTime,
  scoreSeason,
  type DistanceChoice,
} from '../src/domain/scoring';

const SAMPLE_SUFFIX = '(SAMPLE)';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface SampleRunner {
  given: string;
  family: string;
  dob: string;
  category: 'MALE' | 'FEMALE';
}

const RUNNERS: SampleRunner[] = [
  { given: 'Aled', family: 'Barrow', dob: '1979-04-12', category: 'MALE' },
  { given: 'Ben', family: 'Coombe', dob: '1986-09-03', category: 'MALE' },
  { given: 'Cerys', family: 'Dowland', dob: '1990-01-22', category: 'FEMALE' },
  { given: 'Dai', family: 'Ellery', dob: '1972-06-30', category: 'MALE' },
  { given: 'Elin', family: 'Fortune', dob: '1983-11-14', category: 'FEMALE' },
  { given: 'Gareth', family: 'Grove', dob: '1965-02-08', category: 'MALE' },
  { given: 'Heledd', family: 'Hallett', dob: '1995-07-19', category: 'FEMALE' },
  { given: 'Ianto', family: 'Ivy', dob: '1958-10-25', category: 'MALE' },
  { given: 'Jowan', family: 'Jarvis', dob: '1969-05-06', category: 'FEMALE' },
  { given: 'Kit', family: 'Kimberlin', dob: '1981-08-17', category: 'MALE' },
  { given: 'Lowri', family: 'Lano', dob: '1993-03-29', category: 'FEMALE' },
  { given: 'Meredith', family: 'Mutton', dob: '1987-12-11', category: 'FEMALE' },
  { given: 'Nye', family: 'Nicodemus', dob: '1962-01-05', category: 'MALE' },
  { given: 'Olwen', family: 'Osmington', dob: '1975-09-23', category: 'FEMALE' },
];

/** Six rounds of a winter season. Times get gently faster to create improvers. */
const ROUND_DATES = [
  '2025-10-07',
  '2025-11-04',
  '2025-12-02',
  '2026-01-06',
  '2026-02-03',
  '2026-03-03',
];

interface SampleEntry {
  runnerIndex: number;
  distance: DistanceChoice;
  time: string;
}

/** Deterministic pseudo-random so repeated seeds produce the same club. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildRoundEntries(roundIndex: number): SampleEntry[] {
  const entries: SampleEntry[] = [];
  for (let runnerIndex = 0; runnerIndex < RUNNERS.length; runnerIndex += 1) {
    // Most runners appear most rounds, but not everyone every time — missed
    // rounds are what exercise the "look back to the last comparable" rule.
    const attendance = pseudoRandom(roundIndex * 31 + runnerIndex * 7);
    if (attendance < 0.18) continue;

    const distance: DistanceChoice = runnerIndex % 3 === 0 ? 'THREE_LAP' : 'TWO_LAP';
    const baseSeconds = distance === 'TWO_LAP' ? 1120 : 1740;
    const spread = runnerIndex * 34;
    // A slow drift faster across the season, with per-round noise on top.
    const improvement = roundIndex * 9;
    const noise = Math.round((pseudoRandom(roundIndex * 13 + runnerIndex * 3) - 0.5) * 40);
    const total = baseSeconds + spread - improvement + noise;

    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    entries.push({
      runnerIndex,
      distance,
      time: `${minutes}:${String(seconds).padStart(2, '0')}`,
    });
  }
  return entries;
}

const QUALIFYING_RACES = [
  { label: 'BSQ', name: 'Beaminster Steeplechase', date: '2025-02-16', distance: '10 km' },
  { label: 'L10', name: 'Lulworth 10', date: '2025-03-23', distance: '10 miles' },
  { label: 'PC10', name: 'Portland Coastal 10', date: '2025-04-13', distance: '10 km' },
  { label: 'PCHALF', name: 'Portland Coastal Half', date: '2025-05-11', distance: 'Half marathon' },
  { label: 'WB10K', name: 'Weymouth Bay 10K', date: '2025-06-08', distance: '10 km' },
  { label: 'WHALF', name: 'Wessex Half Marathon', date: '2025-07-20', distance: 'Half marathon' },
  { label: 'YHALF', name: 'Yeovil Half Marathon', date: '2025-09-14', distance: 'Half marathon' },
  { label: 'PTPLOD', name: 'Purbeck Plod', date: '2025-10-19', distance: '20 km' },
];

const UPCOMING_RACES = [
  {
    label: 'CHES',
    name: 'Chesil Beach Challenge',
    date: futureDate(21),
    distance: '10 km',
    league: 'Dorset Road Race League',
    location: 'Chesil Beach Visitor Centre, Portland',
    startTime: '10:30',
  },
  {
    label: 'BILL',
    name: 'Portland Bill Lighthouse Run',
    date: futureDate(56),
    distance: '5 miles',
    league: 'Club fixture',
    location: 'Portland Bill',
    startTime: '19:00',
  },
];

function futureDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('\nRefusing to seed sample data in production.\n');
    process.exit(1);
  }
  if (process.env.ALLOW_SAMPLE_SEED !== 'true') {
    console.error(
      '\nSample seeding is disabled. Set ALLOW_SAMPLE_SEED=true to run it.\n' +
        'This guard exists so a deploy cannot create fake runners by accident.\n',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    console.log('Seeding sample data…');

    // --- Sample administrator -------------------------------------------
    const stored = await hashPassword('sample-admin-password');
    const admin = await prisma.administrator.upsert({
      where: { email: 'sample.admin@example.invalid' },
      update: {},
      create: {
        email: 'sample.admin@example.invalid',
        displayName: `Sample Administrator ${SAMPLE_SUFFIX}`,
        passwordHash: stored.hash,
        passwordParameters: storedParametersToJson(stored.parameters),
      },
    });
    console.log(`  administrator: sample.admin@example.invalid / sample-admin-password`);

    // --- Runners ----------------------------------------------------------
    const runnerIds: string[] = [];
    for (const runner of RUNNERS) {
      const familyName = `${runner.family} ${SAMPLE_SUFFIX}`;
      const searchName = `${runner.given} ${familyName}`
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const existing = await prisma.runner.findFirst({ where: { searchName } });
      const record =
        existing ??
        (await prisma.runner.create({
          data: {
            givenName: runner.given,
            familyName,
            searchName,
            dateOfBirth: utc(runner.dob),
            category: runner.category,
          },
        }));
      runnerIds.push(record.id);
    }
    console.log(`  runners: ${runnerIds.length}`);

    // --- Time-trial season ------------------------------------------------
    const seasonSlug = 'sample-winter-2025-26';
    await prisma.ttSeason.deleteMany({ where: { slug: seasonSlug } });

    const season = await prisma.ttSeason.create({
      data: {
        name: `Winter 2025/26 ${SAMPLE_SUFFIX}`,
        slug: seasonSlug,
        type: 'WINTER',
        startDate: utc('2025-10-01'),
        endDate: utc('2026-03-31'),
        clubYearLabel: '2025/26',
        twoLapMetres: SEASON_DISTANCES.WINTER.TWO_LAP,
        threeLapMetres: SEASON_DISTANCES.WINTER.THREE_LAP,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
        scoringRulesVersion: SCORING_RULES_VERSION,
        ageGradeVersion: AGE_GRADE_VERSION,
      },
    });

    const roundIds: string[] = [];
    for (const [index, date] of ROUND_DATES.entries()) {
      // The last round stays a draft so the admin console has something to
      // publish and the impact preview has something to show.
      const isDraft = index === ROUND_DATES.length - 1;
      const round = await prisma.ttRound.create({
        data: {
          seasonId: season.id,
          ordinal: index + 1,
          name: `Round ${index + 1}`,
          date: utc(date),
          state: isDraft ? 'DRAFT' : 'PUBLISHED',
          publishedAt: isDraft ? null : new Date(),
          publishedById: isDraft ? null : admin.id,
        },
      });
      roundIds.push(round.id);

      const entries = buildRoundEntries(index);
      await prisma.ttResult.createMany({
        data: entries.map((entry) => ({
          roundId: round.id,
          runnerId: runnerIds[entry.runnerIndex]!,
          distanceChoice: entry.distance,
          distanceMetres: SEASON_DISTANCES.WINTER[entry.distance],
          elapsedMilliseconds: parseElapsedTime(entry.time),
          finishingPosition: 0,
          finishingPoints: 0,
          scoringRulesVersion: SCORING_RULES_VERSION,
          ageGradeVersion: AGE_GRADE_VERSION,
        })),
      });
    }

    // Derive every score by replaying the real domain functions, exactly as the
    // application does — the seed never writes a hand-computed points value.
    await recalculate(prisma, season.id);
    console.log(`  time trial: ${roundIds.length} rounds (last one left as a draft)`);

    // --- Championship and races ------------------------------------------
    const championship = await prisma.championship.upsert({
      where: { year: 2025 },
      update: { state: 'PUBLISHED' },
      create: {
        year: 2025,
        name: `Club Championship 2025 ${SAMPLE_SUFFIX}`,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
        scoringRulesVersion: SCORING_RULES_VERSION,
      },
    });

    for (const [raceIndex, race] of QUALIFYING_RACES.entries()) {
      const slug = `sample-${race.label.toLowerCase()}-2025`;
      await prisma.race.deleteMany({ where: { slug } });

      const created = await prisma.race.create({
        data: {
          name: `${race.name} ${SAMPLE_SUFFIX}`,
          slug,
          shortLabel: race.label,
          date: utc(race.date),
          distanceLabel: race.distance,
          locationName: 'Dorset',
          leagueName: 'Dorset Road Race League',
          status: 'COMPLETED',
          isChampionshipQualifier: true,
          championshipId: championship.id,
          state: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: admin.id,
        },
      });

      // Rank a subset of the club in each race, separately per category.
      const malePositions = new Map<string, number>();
      const femalePositions = new Map<string, number>();
      let maleNext = 1;
      let femaleNext = 1;

      for (let runnerIndex = 0; runnerIndex < RUNNERS.length; runnerIndex += 1) {
        const attends = pseudoRandom(raceIndex * 17 + runnerIndex * 5) > 0.28;
        if (!attends) continue;
        const runner = RUNNERS[runnerIndex]!;
        if (runner.category === 'MALE') {
          malePositions.set(runnerIds[runnerIndex]!, maleNext++);
        } else {
          femalePositions.set(runnerIds[runnerIndex]!, femaleNext++);
        }
      }

      const rows = [
        ...[...malePositions].map(([runnerId, position]) => ({
          runnerId,
          category: 'MALE' as const,
          position,
        })),
        ...[...femalePositions].map(([runnerId, position]) => ({
          runnerId,
          category: 'FEMALE' as const,
          position,
        })),
      ];

      await prisma.championshipResult.createMany({
        data: rows.map((row) => ({
          raceId: created.id,
          runnerId: row.runnerId,
          category: row.category,
          categoryPosition: row.position,
          score: row.position,
          scoringRulesVersion: SCORING_RULES_VERSION,
        })),
      });
    }
    console.log(`  championship: ${QUALIFYING_RACES.length} qualifying races`);

    for (const race of UPCOMING_RACES) {
      const slug = `sample-${race.label.toLowerCase()}-upcoming`;
      await prisma.race.deleteMany({ where: { slug } });
      await prisma.race.create({
        data: {
          name: `${race.name} ${SAMPLE_SUFFIX}`,
          slug,
          shortLabel: race.label,
          date: utc(race.date),
          startTime: race.startTime,
          distanceLabel: race.distance,
          locationName: race.location,
          leagueName: race.league,
          entryInstructions: 'Enter on the day, or in advance through the organiser.',
          status: 'SCHEDULED',
          isChampionshipQualifier: false,
          state: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: admin.id,
        },
      });
    }
    console.log(`  races: ${UPCOMING_RACES.length} upcoming`);

    console.log('\nSample data seeded. Every record is labelled "(SAMPLE)".\n');
  } finally {
    await prisma.$disconnect();
  }
}

/** Mirrors the application's own recalculation, using the same pure functions. */
async function recalculate(prisma: PrismaClient, seasonId: string): Promise<void> {
  const season = await prisma.ttSeason.findUniqueOrThrow({
    where: { id: seasonId },
    include: {
      rounds: {
        orderBy: { ordinal: 'asc' },
        include: {
          results: {
            include: { runner: { select: { category: true, dateOfBirth: true } } },
          },
        },
      },
    },
  });

  const scoring = scoreSeason({
    seasonType: season.type,
    publishedOnly: false,
    rounds: season.rounds.map((round) => ({
      roundId: round.id,
      ordinal: round.ordinal,
      date: round.date,
      published: round.state === 'PUBLISHED',
      entries: round.results.map((result) => ({
        runnerId: result.runnerId,
        category: result.runner.category,
        dateOfBirth: result.runner.dateOfBirth,
        distanceChoice: result.distanceChoice,
        elapsedMilliseconds: result.elapsedMilliseconds,
      })),
    })),
  });

  for (const round of scoring.rounds) {
    for (const result of round.results) {
      await prisma.ttResult.updateMany({
        where: { roundId: round.roundId, runnerId: result.runnerId },
        data: {
          finishingPosition: result.finishingPosition,
          finishingPoints: result.finishingPoints,
          tiedOnTime: result.tiedOnTime,
          ageGradePercent: result.ageGradePercent?.toFixed(5) ?? null,
          ageOnRoundDate: result.ageOnRoundDate,
          previousAgeGradePercent: result.previousAgeGradePercent?.toFixed(5) ?? null,
          previousRoundOrdinal: result.previousRoundOrdinal,
          improvement: result.improvement?.toFixed(5) ?? null,
          improvementPosition: result.improvementPosition,
          improvementPoints: result.improvementPoints,
          roundTotal: result.roundTotal,
        },
      });
    }
  }

  if (scoring.problems.length > 0) {
    console.warn(`  warning: ${scoring.problems.length} sample result(s) could not be age-graded`);
  }
}

main().catch((error) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
