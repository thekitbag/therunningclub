/**
 * Fixture data for the browser suite.
 *
 * Builds a small but complete club: two administrators, a published winter
 * season with results, a draft round to publish during the test, a published
 * championship, and an upcoming race. Everything is derived through the real
 * scoring domain so the browser assertions check genuine numbers.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma';
import { hashPassword, storedParametersToJson } from '../../src/lib/password';
import {
  AGE_GRADE_VERSION,
  SCORING_RULES_VERSION,
  SEASON_DISTANCES,
  parseElapsedTime,
  scoreSeason,
} from '../../src/domain/scoring';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ADMIN = {
  email: 'e2e.admin@example.invalid',
  password: 'e2e-admin-password-long-enough',
  displayName: 'E2E Administrator',
};

const SECOND_ADMIN = {
  email: 'e2e.second@example.invalid',
  password: 'e2e-second-password-long-enough',
  displayName: 'E2E Second Admin',
};

const RUNNERS = [
  { given: 'Aled', family: 'Barrow', dob: '1979-04-12', category: 'MALE' as const },
  { given: 'Bryn', family: 'Coombe', dob: '1986-09-03', category: 'MALE' as const },
  { given: 'Cerys', family: 'Dowland', dob: '1990-01-22', category: 'FEMALE' as const },
  { given: 'Elin', family: 'Fortune', dob: '1983-11-14', category: 'FEMALE' as const },
  { given: 'Gareth', family: 'Grove', dob: '1965-02-08', category: 'MALE' as const },
  { given: 'Heledd', family: 'Hallett', dob: '1995-07-19', category: 'FEMALE' as const },
];

/** Round 1 and 2 published; round 3 left as a draft for the publish journey. */
const ROUNDS = [
  {
    ordinal: 1,
    date: '2025-10-07',
    published: true,
    times: ['20:00', '21:00', '24:00', '25:00', '22:30', '26:00'],
  },
  {
    ordinal: 2,
    date: '2025-11-04',
    published: true,
    times: ['19:30', '21:30', '23:30', '25:30', '22:00', '25:00'],
  },
  {
    ordinal: 3,
    date: '2025-12-02',
    published: false,
    times: ['19:00', '20:30', '23:00', '24:30', '21:30', '24:00'],
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  if (!/test/i.test(connectionString)) {
    throw new Error(
      `Refusing to seed "${connectionString}": the database name must contain "test".`,
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "tt_result", "tt_round", "tt_season", "championship_result", ' +
        '"race", "championship", "runner", "audit_event", "admin_password_reset", ' +
        '"admin_session", "administrator" RESTART IDENTITY CASCADE;',
    );

    for (const account of [ADMIN, SECOND_ADMIN]) {
      const stored = await hashPassword(account.password);
      await prisma.administrator.create({
        data: {
          email: account.email,
          displayName: account.displayName,
          passwordHash: stored.hash,
          passwordParameters: storedParametersToJson(stored.parameters),
        },
      });
    }
    const admin = await prisma.administrator.findUniqueOrThrow({ where: { email: ADMIN.email } });

    const runnerIds: string[] = [];
    for (const runner of RUNNERS) {
      const created = await prisma.runner.create({
        data: {
          givenName: runner.given,
          familyName: runner.family,
          searchName: `${runner.given} ${runner.family}`.toLowerCase(),
          dateOfBirth: utc(runner.dob),
          category: runner.category,
        },
      });
      runnerIds.push(created.id);
    }

    const season = await prisma.ttSeason.create({
      data: {
        name: 'Winter 2025/26',
        slug: 'winter-2025-26',
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

    for (const round of ROUNDS) {
      const created = await prisma.ttRound.create({
        data: {
          seasonId: season.id,
          ordinal: round.ordinal,
          name: `Round ${round.ordinal}`,
          date: utc(round.date),
          state: round.published ? 'PUBLISHED' : 'DRAFT',
          publishedAt: round.published ? new Date() : null,
          publishedById: round.published ? admin.id : null,
        },
      });

      await prisma.ttResult.createMany({
        data: round.times.map((time, index) => ({
          roundId: created.id,
          runnerId: runnerIds[index]!,
          // Two runners take the three-lap option so both tables have data.
          distanceChoice: index % 3 === 0 ? ('THREE_LAP' as const) : ('TWO_LAP' as const),
          distanceMetres:
            index % 3 === 0 ? SEASON_DISTANCES.WINTER.THREE_LAP : SEASON_DISTANCES.WINTER.TWO_LAP,
          elapsedMilliseconds: parseElapsedTime(time),
          finishingPosition: 0,
          finishingPoints: 0,
          scoringRulesVersion: SCORING_RULES_VERSION,
          ageGradeVersion: AGE_GRADE_VERSION,
        })),
      });
    }

    await recalculate(prisma, season.id);

    // --- Championship -----------------------------------------------------
    const championship = await prisma.championship.create({
      data: {
        year: 2025,
        name: 'Club Championship 2025',
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
        scoringRulesVersion: SCORING_RULES_VERSION,
      },
    });

    const qualifiers = [
      { label: 'PC10', name: 'Portland Coastal 10', date: '2025-03-16' },
      { label: 'WB10K', name: 'Weymouth Bay 10K', date: '2025-04-20' },
      { label: 'WHALF', name: 'Wessex Half Marathon', date: '2025-05-18' },
      { label: 'YHALF', name: 'Yeovil Half Marathon', date: '2025-06-15' },
      { label: 'PTPLOD', name: 'Purbeck Plod', date: '2025-07-13' },
      { label: 'BSQ', name: 'Beaminster Steeplechase', date: '2025-08-17' },
    ];

    for (const [raceIndex, qualifier] of qualifiers.entries()) {
      const race = await prisma.race.create({
        data: {
          name: qualifier.name,
          slug: `${qualifier.label.toLowerCase()}-2025`,
          shortLabel: qualifier.label,
          date: utc(qualifier.date),
          distanceLabel: '10 km',
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

      let maleNext = 1;
      let femaleNext = 1;
      const rows = RUNNERS.map((runner, index) => ({
        runnerId: runnerIds[index]!,
        category: runner.category,
        // Rotate the order slightly per race so totals differ between runners.
        position: 0,
        sortKey: (index + raceIndex) % RUNNERS.length,
      }))
        // The last man sits out the final qualifier, so the published table has
        // a genuine "did not run" cell and one runner short of eligibility.
        .filter(
          (row) =>
            !(raceIndex === qualifiers.length - 1 && row.category === 'MALE' && row.sortKey === 0),
        )
        .sort((a, b) => a.sortKey - b.sortKey)
        .map((row) => ({
          ...row,
          position: row.category === 'MALE' ? maleNext++ : femaleNext++,
        }));

      await prisma.championshipResult.createMany({
        data: rows.map((row) => ({
          raceId: race.id,
          runnerId: row.runnerId,
          category: row.category,
          categoryPosition: row.position,
          score: row.position,
          scoringRulesVersion: SCORING_RULES_VERSION,
        })),
      });
    }

    // --- Upcoming race ----------------------------------------------------
    const upcoming = new Date();
    upcoming.setUTCDate(upcoming.getUTCDate() + 30);
    await prisma.race.create({
      data: {
        name: 'Chesil Beach Challenge',
        slug: 'chesil-beach-challenge',
        shortLabel: 'CHES',
        date: utc(upcoming.toISOString().slice(0, 10)),
        startTime: '10:30',
        distanceLabel: '10 km',
        locationName: 'Chesil Beach Visitor Centre',
        leagueName: 'Dorset Road Race League',
        entryInstructions: 'Enter on the day.',
        externalUrl: 'https://example.com/chesil',
        status: 'SCHEDULED',
        isChampionshipQualifier: false,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
      },
    });

    console.log('e2e fixture seeded');
  } finally {
    await prisma.$disconnect();
  }
}

async function recalculate(prisma: PrismaClient, seasonId: string): Promise<void> {
  const season = await prisma.ttSeason.findUniqueOrThrow({
    where: { id: seasonId },
    include: {
      rounds: {
        orderBy: { ordinal: 'asc' },
        include: {
          results: { include: { runner: { select: { category: true, dateOfBirth: true } } } },
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
}

main().catch((error) => {
  console.error('e2e seed failed:', error);
  process.exit(1);
});
