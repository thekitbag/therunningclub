/**
 * Loads the club's real Summer 2026 time-trial data into a development database.
 *
 * Source: "RMPAC Summer Time Trial Results - 25 August 2026" (two pages).
 *   Page 1 is the 25 August round as run.
 *   Page 2 is the season-to-date table, April to September.
 *
 * The two pages were cross-checked against each other before this file was
 * written: page 2's August column reproduces all seventeen of page 1's rows
 * exactly, which is what confirms the month each column belongs to.
 *
 * The club runs a handicap time trial, so the sheet records three values per
 * runner: ST (start), FT (finish) and AT (actual running time), where
 * `AT = ST - FT`. That identity holds for every row on page 1. **AT is what is
 * stored here** — it is the runner's real elapsed time, and it is what the
 * scoring rules rank on. Note that the sheet's own 1..13 numbering is handicap
 * order, so the positions this application calculates will differ from it; that
 * is correct, not a discrepancy.
 *
 * ---------------------------------------------------------------------------
 * TWO PLACEHOLDERS, BOTH DELIBERATE AND BOTH VISIBLE
 * ---------------------------------------------------------------------------
 *
 * 1. DATES OF BIRTH ARE NOT IN THE SHEET, and the specification is explicit
 *    that birth dates must not be invented for real named runners. Every runner
 *    below therefore shares one obvious stand-in date, `PLACEHOLDER_DOB`.
 *
 *    The consequence is precise, so it is worth stating exactly:
 *      - Absolute age-grade percentages are SYNTHETIC. They are computed as if
 *        every runner were the same age, so they are not the club's real age
 *        grades and must not be published.
 *      - Improvement points are still meaningful in ordering, because a runner
 *        is only ever compared with their own earlier result at the same
 *        distance. With a constant birth date that comparison reduces to a pure
 *        time improvement.
 *      - Finishing points, round totals and best-four standings are entirely
 *        real: they depend only on elapsed times.
 *
 *    Enter the real dates through /admin/runners to fix this. Doing so
 *    recalculates every affected season automatically.
 *
 * 2. ROUND DATES for April to July are inferred as the last Tuesday of each
 *    month, which is the pattern 25 August 2026 follows. Only August's date is
 *    known from the sheet. The inferred dates affect nothing except display and
 *    the order rounds are scored in, which is already fixed by their ordinal.
 *
 * Usage:  ALLOW_SAMPLE_SEED=true npm run seed:club
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

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** See the note above. Not any runner's real date of birth. */
const PLACEHOLDER_DOB = utc('1980-01-01');

type Category = 'MALE' | 'FEMALE';

/**
 * How each runner's scoring category was determined.
 *
 * `championship-2025` means the club's own 2025 club-championship sheet lists
 * them under that category — a club-authored source. `name` means it was
 * inferred from the first name alone and should be confirmed by the club.
 */
type CategorySource = 'championship-2025' | 'name';

interface ClubRunner {
  readonly given: string;
  readonly family: string;
  readonly category: Category;
  readonly categorySource: CategorySource;
}

const RUNNERS: readonly ClubRunner[] = [
  { given: 'Darren', family: 'Askew', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Nick', family: 'Bearman', category: 'MALE', categorySource: 'name' },
  { given: 'Pete', family: 'Bell', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Debbie', family: 'Cain', category: 'FEMALE', categorySource: 'name' },
  { given: 'John', family: 'Chester', category: 'MALE', categorySource: 'name' },
  { given: 'Tracy', family: 'Christie', category: 'FEMALE', categorySource: 'name' },
  { given: 'Jack', family: 'Creighton', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Salah', family: 'Dahir', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Andy', family: 'DeHavilland', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Jon', family: 'Dunk', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Melissa', family: 'Eryilmaz', category: 'FEMALE', categorySource: 'name' },
  { given: 'Chris', family: 'Ginifer', category: 'MALE', categorySource: 'name' },
  { given: 'Mark', family: 'Gray', category: 'MALE', categorySource: 'name' },
  { given: 'Gary', family: 'Haylock', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Damian', family: 'Hayward', category: 'MALE', categorySource: 'name' },
  { given: 'Laura', family: 'Last', category: 'FEMALE', categorySource: 'championship-2025' },
  { given: 'Liz', family: 'Lewis', category: 'FEMALE', categorySource: 'championship-2025' },
  { given: 'Ellie', family: 'Makin', category: 'FEMALE', categorySource: 'name' },
  { given: 'Darren', family: 'Mills', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Nikki', family: 'Morris', category: 'FEMALE', categorySource: 'name' },
  { given: 'Jerry', family: 'Packer', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Laura', family: 'Pearson', category: 'FEMALE', categorySource: 'championship-2025' },
  { given: 'Stu', family: 'Pearson', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Mark', family: 'Salmon', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Jules', family: 'Stout', category: 'MALE', categorySource: 'name' },
  { given: 'Warren', family: 'Taylor', category: 'MALE', categorySource: 'name' },
  { given: 'Callum', family: 'Underwood', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Steve', family: 'White', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Pete', family: 'Wiles', category: 'MALE', categorySource: 'championship-2025' },
  { given: 'Jim', family: 'Young', category: 'MALE', categorySource: 'name' },
];

/** Round 1 is April; round 6 is September and has not been run. */
const ROUNDS = [
  { ordinal: 1, month: 'April', date: '2026-04-28', dateSource: 'inferred' },
  { ordinal: 2, month: 'May', date: '2026-05-26', dateSource: 'inferred' },
  { ordinal: 3, month: 'June', date: '2026-06-30', dateSource: 'inferred' },
  { ordinal: 4, month: 'July', date: '2026-07-28', dateSource: 'inferred' },
  { ordinal: 5, month: 'August', date: '2026-08-25', dateSource: 'from the sheet' },
  { ordinal: 6, month: 'September', date: '2026-09-29', dateSource: 'inferred' },
] as const;

/**
 * Actual running times, transcribed from page 2 as `mm.ss`.
 *
 * Each array is April, May, June, July, August. `null` means the runner did not
 * run that round — which the scoring rules treat as absence, never as a zero.
 */
type Season = readonly (string | null)[];

const THREE_LAP: Readonly<Record<string, Season>> = {
  'Darren Askew': ['42.26', null, '42.43', null, null],
  'Pete Bell': [null, null, '40.39', null, null],
  'John Chester': [null, null, null, null, '44.00'],
  'Jack Creighton': [null, '40.22', '36.36', null, null],
  'Salah Dahir': [null, null, '38.36', null, null],
  'Jon Dunk': [null, '40.29', null, '40.35', null],
  'Mark Gray': ['38.19', null, null, null, null],
  'Gary Haylock': [null, null, null, '42.34', null],
  'Damian Hayward': ['33.43', null, null, null, null],
  'Liz Lewis': ['42.47', '44.16', '41.38', '42.30', '43.13'],
  'Jerry Packer': [null, null, null, null, '43.13'],
  'Callum Underwood': [null, '38.46', null, null, null],
  'Steve White': [null, '43.06', '41.40', '42.16', '42.33'],
  'Pete Wiles': ['36.42', '36.01', null, '37.29', null],
};

const TWO_LAP: Readonly<Record<string, Season>> = {
  'Nick Bearman': [null, '34.58', null, null, '35.03'],
  'Pete Bell': [null, null, null, null, '30.20'],
  'Debbie Cain': ['40.50', '39.58', '39.04', '40.00', '38.53'],
  'Tracy Christie': [null, null, null, null, '39.40'],
  'Andy DeHavilland': [null, '38.36', null, null, '37.37'],
  'Melissa Eryilmaz': [null, null, null, null, '43.14'],
  'Chris Ginifer': ['33.11', '37.13', null, '35.15', '35.07'],
  'Laura Last': ['31.54', null, null, '30.51', null],
  'Ellie Makin': [null, null, null, null, '39.38'],
  'Darren Mills': [null, '33.07', null, null, null],
  'Nikki Morris': [null, null, null, '39.27', null],
  'Jerry Packer': ['31.03', null, null, null, null],
  'Stu Pearson': [null, '35.26', null, null, '36.37'],
  'Laura Pearson': ['38.09', '38.57', '37.50', '38.39', '39.18'],
  'Mark Salmon': [null, '37.09', '32.28', '35.05', null],
  'Jules Stout': ['35.24', '33.50', '32.33', '31.58', '31.58'],
  'Warren Taylor': [null, '34.34', null, '38.41', '35.50'],
  'Jim Young': ['32.28', '31.21', '30.31', '30.43', '30.08'],
};

/** The sheet's own footer advertises this fixture for the following Tuesday. */
const UPCOMING_RACE = {
  name: 'Dumble Bimble 5K & 2K',
  shortLabel: 'DUMBLE',
  date: '2026-09-01',
  startTime: '18:30',
  locationName: 'PUFC Ground',
  distanceLabel: '5 km and 2 km',
  entryInstructions: 'All proceeds to Weldmar Hospice.',
};

/** The sheet's `mm.ss` becomes the `mm:ss` the domain parser expects. */
function toElapsed(sheetTime: string): number {
  const match = /^(\d{1,3})\.(\d{2})$/.exec(sheetTime);
  if (!match) throw new Error(`"${sheetTime}" is not in the sheet's mm.ss format.`);
  const [, minutes, seconds] = match as unknown as [string, string, string];
  if (Number(seconds) > 59) throw new Error(`"${sheetTime}" has more than 59 seconds.`);
  return parseElapsedTime(`${Number(minutes)}:${seconds}`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('\nRefusing to seed a development dataset in production.\n');
    process.exit(1);
  }
  if (process.env.ALLOW_SAMPLE_SEED !== 'true') {
    console.error(
      '\nSeeding is disabled. Set ALLOW_SAMPLE_SEED=true to run it.\n' +
        'This dataset carries placeholder dates of birth and must not reach production.\n',
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
    // Guard against the same runner appearing at both distances in one round,
    // which the schema forbids and which would mean a transcription error.
    for (const [index, round] of ROUNDS.slice(0, 5).entries()) {
      for (const name of Object.keys(THREE_LAP)) {
        if (THREE_LAP[name]?.[index] && TWO_LAP[name]?.[index]) {
          throw new Error(`${name} has both distances in ${round.month}.`);
        }
      }
    }

    console.log('Loading the club’s Summer 2026 time-trial data…');

    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "tt_result", "tt_round", "tt_season", "championship_result", ' +
        '"race", "championship", "runner", "audit_event", "admin_password_reset", ' +
        '"admin_session", "administrator" RESTART IDENTITY CASCADE;',
    );

    const stored = await hashPassword('dev-admin-password');
    const admin = await prisma.administrator.create({
      data: {
        email: 'dev.admin@example.invalid',
        displayName: 'Development Administrator',
        passwordHash: stored.hash,
        passwordParameters: storedParametersToJson(stored.parameters),
      },
    });

    const runnerIdByName = new Map<string, string>();
    for (const runner of RUNNERS) {
      const fullName = `${runner.given} ${runner.family}`;
      const created = await prisma.runner.create({
        data: {
          givenName: runner.given,
          familyName: runner.family,
          searchName: fullName
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
          dateOfBirth: PLACEHOLDER_DOB,
          category: runner.category,
        },
      });
      runnerIdByName.set(fullName, created.id);
    }

    const season = await prisma.ttSeason.create({
      data: {
        name: 'Summer 2026',
        slug: 'summer-2026',
        type: 'SUMMER',
        startDate: utc('2026-04-01'),
        endDate: utc('2026-09-30'),
        clubYearLabel: '2026',
        twoLapMetres: SEASON_DISTANCES.SUMMER.TWO_LAP,
        threeLapMetres: SEASON_DISTANCES.SUMMER.THREE_LAP,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
        scoringRulesVersion: SCORING_RULES_VERSION,
        ageGradeVersion: AGE_GRADE_VERSION,
      },
    });

    let resultCount = 0;
    for (const [index, round] of ROUNDS.entries()) {
      // September has not been run, so it exists as a draft with no results.
      const hasResults = index < 5;

      const created = await prisma.ttRound.create({
        data: {
          seasonId: season.id,
          ordinal: round.ordinal,
          name: `${round.month} time trial`,
          date: utc(round.date),
          state: hasResults ? 'PUBLISHED' : 'DRAFT',
          publishedAt: hasResults ? new Date() : null,
          publishedById: hasResults ? admin.id : null,
        },
      });
      if (!hasResults) continue;

      const entries: { runnerId: string; distanceChoice: DistanceChoice; ms: number }[] = [];
      for (const [table, choice] of [
        [TWO_LAP, 'TWO_LAP'],
        [THREE_LAP, 'THREE_LAP'],
      ] as const) {
        for (const [name, times] of Object.entries(table)) {
          const sheetTime = times[index];
          if (!sheetTime) continue;
          const runnerId = runnerIdByName.get(name);
          if (!runnerId) throw new Error(`No runner record for "${name}".`);
          entries.push({ runnerId, distanceChoice: choice, ms: toElapsed(sheetTime) });
        }
      }

      await prisma.ttResult.createMany({
        data: entries.map((entry) => ({
          roundId: created.id,
          runnerId: entry.runnerId,
          distanceChoice: entry.distanceChoice,
          distanceMetres: SEASON_DISTANCES.SUMMER[entry.distanceChoice],
          elapsedMilliseconds: entry.ms,
          finishingPosition: 0,
          finishingPoints: 0,
          scoringRulesVersion: SCORING_RULES_VERSION,
          ageGradeVersion: AGE_GRADE_VERSION,
        })),
      });
      resultCount += entries.length;
      console.log(`  ${round.month.padEnd(10)} ${entries.length} results`);
    }

    // Every score is derived by replaying the real domain functions, exactly as
    // the application does. Nothing below is a hand-computed points value.
    const scoring = await recalculate(prisma, season.id);

    await prisma.race.create({
      data: {
        name: UPCOMING_RACE.name,
        slug: 'dumble-bimble-2026',
        shortLabel: UPCOMING_RACE.shortLabel,
        date: utc(UPCOMING_RACE.date),
        startTime: UPCOMING_RACE.startTime,
        locationName: UPCOMING_RACE.locationName,
        distanceLabel: UPCOMING_RACE.distanceLabel,
        entryInstructions: UPCOMING_RACE.entryInstructions,
        status: 'SCHEDULED',
        isChampionshipQualifier: false,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: admin.id,
      },
    });

    const inferredCategories = RUNNERS.filter((r) => r.categorySource === 'name');

    console.log(
      `\n${RUNNERS.length} runners, ${resultCount} results across 5 published rounds.\n` +
        `Admin: dev.admin@example.invalid / dev-admin-password\n` +
        `\nCarry these caveats with the data:\n` +
        `  - Dates of birth are a single placeholder, so age-grade percentages are\n` +
        `    synthetic. Finishing points and best-four standings are real.\n` +
        `  - ${inferredCategories.length} scoring categories were inferred from first names and want\n` +
        `    confirming: ${inferredCategories.map((r) => `${r.given} ${r.family}`).join(', ')}.\n` +
        `  - Round dates for April to July are inferred as the last Tuesday of the\n` +
        `    month; only August is stated on the sheet.\n`,
    );

    if (scoring.problems.length > 0) {
      console.warn(`  warning: ${scoring.problems.length} result(s) could not be age-graded`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** Mirrors the application's own recalculation, using the same pure functions. */
async function recalculate(prisma: PrismaClient, seasonId: string) {
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

  return scoring;
}

main().catch((error) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
