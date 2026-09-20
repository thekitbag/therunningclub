/**
 * Loads the club's Summer 2026 time-trial times into a season that already
 * exists, then rescores it.
 *
 * Source: "RMPAC Summer Time Trial Results - 25 August 2026" (2 pages).
 *   Page 1 — the 25 August round as run.
 *   Page 2 — the season-to-date table, April to September.
 *
 * The two pages cross-check each other and both were read before this file was
 * written: page 2's August column reproduces all seventeen of page 1's rows
 * exactly, four at three laps and thirteen at two, which is what pins each
 * column to its month. Page 2 runs several months' cells together where a
 * runner ran consecutive rounds ("40.2236.36"), so that confirmation matters.
 *
 * The club runs a handicap time trial, so page 1 records ST (start), FT
 * (finish) and AT (actual running time). **AT is what is stored here** — it is
 * the real elapsed time and it is what the scoring rules rank on. Page 1's own
 * 1..13 numbering is handicap order, so the positions this application
 * calculates will differ from the sheet. That is correct, not a discrepancy.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SCRIPT AND NOT A .sql FILE
 * ---------------------------------------------------------------------------
 *
 * `tt_result` carries derived columns — finishing position and points, age
 * grade, improvement, round total. Writing those by hand in SQL would be
 * inventing scores. Instead this inserts only the raw inputs (runner, distance,
 * elapsed time) and then calls `recalculateSeason` from
 * src/services/time-trials.ts — the same function the admin screens call — to
 * replay the pure domain scorer across the whole season. Every number in the
 * database therefore comes from the application's own code.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   # Dry run. Writes nothing. Do this first.
 *   DATABASE_URL="<render external connection string>" \
 *     npx tsx scripts/import-tt-times-2026.ts
 *
 *   # Apply.
 *   DATABASE_URL="..." npx tsx scripts/import-tt-times-2026.ts --apply
 *
 * Options:
 *   --season=<slug>  Season to load into. Default "summer-2026".
 *   --replace        Overwrite rounds that already hold results. Without this
 *                    a round with results is left untouched and reported.
 *
 * The script does not publish anything. Round publication state is left exactly
 * as it is, because publishing is a decision with a preview screen behind it in
 * /admin. Nothing here reaches the public site until you publish it there.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { recalculateSeason } from '../src/services/time-trials';
import { normaliseSearchName } from '../src/services/runners';
import {
  SEASON_DISTANCES,
  formatElapsedTime,
  parseElapsedTime,
  type DistanceChoice,
} from '../src/domain/scoring';

/**
 * Page 2's month columns. September is on the sheet but empty — the round had
 * not been run when it was printed — so it carries no times here.
 */
const MONTHS = ['April', 'May', 'June', 'July', 'August'] as const;

/** Actual running times as printed, `mm.ss`, in MONTHS order. */
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

/** The sheet's `mm.ss` becomes the `mm:ss` the domain parser expects. */
function toElapsed(sheetTime: string, who: string, month: string): number {
  const match = /^(\d{1,3})\.(\d{2})$/.exec(sheetTime);
  if (!match) throw new Error(`${who}, ${month}: "${sheetTime}" is not the sheet's mm.ss format.`);
  const [, minutes, seconds] = match as unknown as [string, string, string];
  return parseElapsedTime(`${Number(minutes)}:${seconds}`);
}

/**
 * Host and database name from a connection string, with the credentials
 * stripped, plus a plain-language note about which machine that is.
 */
function describeTarget(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return 'could not read DATABASE_URL as a URL';
  }
  const host = url.hostname || '(none)';
  const database = url.pathname.replace(/^\//, '') || '(none)';
  const local = host === 'localhost' || host === '127.0.0.1';
  return `${database} on ${host}  <- ${local ? 'YOUR LAPTOP, not production' : 'REMOTE'}`;
}

interface Options {
  readonly apply: boolean;
  readonly replace: boolean;
  readonly seasonSlug: string;
}

function readOptions(argv: readonly string[]): Options {
  const seasonArg = argv.find((a) => a.startsWith('--season='));
  return {
    apply: argv.includes('--apply'),
    replace: argv.includes('--replace'),
    seasonSlug: seasonArg ? seasonArg.slice('--season='.length) : 'summer-2026',
  };
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }

  // Say which database this is, every time. `import 'dotenv/config'` above means
  // a .env in the project could supply a DATABASE_URL; an exported one takes
  // precedence over it, but "which one won" is not something to have to reason
  // about with a production import a keystroke away. Password is never shown.
  console.log(`\nDatabase: ${describeTarget(connectionString)}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // -- Find the season -----------------------------------------------------

    const season = await prisma.ttSeason.findUnique({
      where: { slug: options.seasonSlug },
      include: {
        rounds: { orderBy: { ordinal: 'asc' }, include: { _count: { select: { results: true } } } },
      },
    });

    if (!season) {
      const available = await prisma.ttSeason.findMany({
        select: { slug: true, name: true, type: true },
        orderBy: { startDate: 'desc' },
      });
      console.error(`\nNo season with slug "${options.seasonSlug}".`);
      console.error(
        available.length === 0
          ? 'There are no seasons at all. Create one in /admin first.\n'
          : `Seasons in this database:\n${available
              .map((s) => `  --season=${s.slug}   (${s.name}, ${s.type})`)
              .join('\n')}\n`,
      );
      process.exit(1);
    }

    console.log(`\nSeason: ${season.name} (${season.slug}, ${season.type}, ${season.state})`);
    console.log(`  two lap ${season.twoLapMetres} m, three lap ${season.threeLapMetres} m`);

    if (season.type !== 'SUMMER') {
      console.error(
        `\nThat season is ${season.type}, and these are summer time-trial times run over the\n` +
          'summer distances. Loading them into a winter season would grade them against the\n' +
          'wrong distance. Pass --season=<slug> for the right one.\n',
      );
      process.exit(1);
    }

    // -- Match the sheet's months onto the season's rounds -------------------
    //
    // Matched on the calendar month of each round's date rather than on
    // ordinal, so the import lands correctly however the rounds were set up.

    const roundByMonth = new Map<string, (typeof season.rounds)[number]>();
    for (const round of season.rounds) {
      const monthName = MONTHS[round.date.getUTCMonth() - 3];
      if (monthName) roundByMonth.set(monthName, round);
    }

    console.log('\nRounds in this season:');
    for (const round of season.rounds) {
      const month = MONTHS[round.date.getUTCMonth() - 3] ?? '—';
      console.log(
        `  ${String(round.ordinal).padStart(2)}. ${round.name.padEnd(24)} ` +
          `${round.date.toISOString().slice(0, 10)}  ${round.state.padEnd(9)} ` +
          `${round._count.results} result(s)   [sheet column: ${month}]`,
      );
    }

    const missing = MONTHS.filter((m) => !roundByMonth.has(m));
    if (missing.length > 0) {
      console.error(
        `\nThe sheet has times for ${missing.join(', ')} but this season has no round dated in ` +
          `${missing.length === 1 ? 'that month' : 'those months'}.\n` +
          'Add the missing round(s) in /admin and run again.\n',
      );
      process.exit(1);
    }

    // -- Resolve runners -----------------------------------------------------

    const names = new Set([...Object.keys(THREE_LAP), ...Object.keys(TWO_LAP)]);
    const searchNames = new Map<string, string>();
    for (const name of names) {
      const [given, ...rest] = name.split(' ');
      searchNames.set(name, normaliseSearchName(given as string, rest.join(' ')));
    }

    const runnerRows = await prisma.runner.findMany({
      where: { searchName: { in: [...searchNames.values()] }, status: { not: 'MERGED' } },
      select: { id: true, searchName: true, givenName: true, familyName: true },
    });

    const idBySearchName = new Map<string, string>();
    const ambiguous: string[] = [];
    for (const row of runnerRows) {
      if (idBySearchName.has(row.searchName)) ambiguous.push(`${row.givenName} ${row.familyName}`);
      idBySearchName.set(row.searchName, row.id);
    }

    const unknown = [...searchNames.entries()]
      .filter(([, search]) => !idBySearchName.has(search))
      .map(([name]) => name);

    if (unknown.length > 0) {
      console.error(
        `\n${unknown.length} runner(s) on the sheet are not in the database:\n` +
          unknown.map((n) => `  ${n}`).join('\n') +
          '\nRun scripts/sql/import-runners-2026.sql first, or add them in /admin.\n',
      );
      process.exit(1);
    }
    if (ambiguous.length > 0) {
      console.error(
        `\nMore than one active runner matches: ${ambiguous.join(', ')}.\n` +
          'Merge the duplicates in /admin so there is one record to attach results to.\n',
      );
      process.exit(1);
    }

    // -- Build the rows ------------------------------------------------------

    interface Entry {
      readonly runnerId: string;
      readonly name: string;
      readonly distanceChoice: DistanceChoice;
      readonly elapsedMilliseconds: number;
    }

    const byMonth = new Map<string, Entry[]>();
    for (const [index, month] of MONTHS.entries()) {
      const entries: Entry[] = [];
      for (const [table, choice] of [
        [TWO_LAP, 'TWO_LAP'],
        [THREE_LAP, 'THREE_LAP'],
      ] as const) {
        for (const [name, times] of Object.entries(table)) {
          const sheetTime = times[index];
          if (!sheetTime) continue;
          entries.push({
            runnerId: idBySearchName.get(searchNames.get(name) as string) as string,
            name,
            distanceChoice: choice,
            elapsedMilliseconds: toElapsed(sheetTime, name, month),
          });
        }
      }
      byMonth.set(month, entries);
    }

    // The schema forbids one runner at both distances in a round, and it would
    // mean a transcription error rather than something to reconcile.
    for (const [month, entries] of byMonth) {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.runnerId)) {
          throw new Error(`${entry.name} appears twice in ${month}.`);
        }
        seen.add(entry.runnerId);
      }
    }

    // -- Report, then write --------------------------------------------------

    console.log(`\n${options.apply ? 'Loading' : 'Would load'}:`);
    const plan: { month: string; round: (typeof season.rounds)[number]; entries: Entry[] }[] = [];
    let skipped = 0;

    for (const month of MONTHS) {
      const round = roundByMonth.get(month) as (typeof season.rounds)[number];
      const entries = byMonth.get(month) as Entry[];
      const twoLap = entries.filter((e) => e.distanceChoice === 'TWO_LAP').length;

      if (round._count.results > 0 && !options.replace) {
        console.log(
          `  ${month.padEnd(6)} SKIPPED — round already holds ${round._count.results} result(s). ` +
            'Re-run with --replace to overwrite.',
        );
        skipped += 1;
        continue;
      }

      console.log(
        `  ${month.padEnd(6)} ${String(entries.length).padStart(2)} results ` +
          `(${twoLap} two-lap, ${entries.length - twoLap} three-lap)` +
          (round._count.results > 0 ? `  — replacing ${round._count.results}` : ''),
      );
      plan.push({ month, round, entries });
    }

    if (!options.apply) {
      console.log(
        `\nDry run. Nothing was written.\n` +
          `Re-run with --apply to load ${plan.reduce((n, p) => n + p.entries.length, 0)} result(s).\n`,
      );
      return;
    }

    if (plan.length === 0) {
      console.log('\nNothing to do.\n');
      return;
    }

    // One transaction: a half-loaded season would show wrong positions for
    // every runner in it until the rest arrived.
    const scoring = await prisma.$transaction(async (tx) => {
      for (const { round, entries } of plan) {
        await tx.ttResult.deleteMany({ where: { roundId: round.id } });
        await tx.ttResult.createMany({
          data: entries.map((entry) => ({
            roundId: round.id,
            runnerId: entry.runnerId,
            distanceChoice: entry.distanceChoice,
            distanceMetres: SEASON_DISTANCES.SUMMER[entry.distanceChoice],
            elapsedMilliseconds: entry.elapsedMilliseconds,
            // Placeholders. Overwritten a few lines below by the real scorer.
            finishingPosition: 0,
            finishingPoints: 0,
            scoringRulesVersion: season.scoringRulesVersion,
            ageGradeVersion: season.ageGradeVersion,
          })),
        });
      }

      // The application's own function, not a copy of it.
      return recalculateSeason(season.id, tx);
    });

    await prisma.auditEvent.create({
      data: {
        action: 'tt.results.imported',
        entityType: 'TtSeason',
        entityId: season.id,
        summary: {
          source: 'RMPAC Summer Time Trial Results - 25 August 2026',
          rounds: plan.map((p) => ({ month: p.month, results: p.entries.length })),
          note: 'Raw times imported by script; all derived scores produced by recalculateSeason.',
        },
      },
    });

    // -- Show what the scorer produced ---------------------------------------

    const runnerName = new Map(runnerRows.map((r) => [r.id, `${r.givenName} ${r.familyName}`]));

    console.log('\nAugust round as scored:');
    const august = scoring.rounds.find((r) => r.roundId === roundByMonth.get('August')?.id);
    for (const choice of ['TWO_LAP', 'THREE_LAP'] as const) {
      const field = (august?.results ?? [])
        .filter((r) => r.distanceChoice === choice)
        .sort((a, b) => a.finishingPosition - b.finishingPosition);
      if (field.length === 0) continue;
      console.log(`  ${choice === 'TWO_LAP' ? '2 laps' : '3 laps'}`);
      for (const result of field) {
        console.log(
          `    ${String(result.finishingPosition).padStart(2)}. ` +
            `${(runnerName.get(result.runnerId) ?? result.runnerId).padEnd(18)} ` +
            `${formatElapsedTime(result.elapsedMilliseconds).padStart(7)}  ` +
            `${String(result.finishingPoints).padStart(2)} pts` +
            (result.ageGradePercent === null
              ? ''
              : `  ${result.ageGradePercent.toFixed(2)}% age grade`),
        );
      }
    }

    for (const category of ['MALE', 'FEMALE'] as const) {
      const standings = scoring.standings[category].slice(0, 5);
      if (standings.length === 0) continue;
      console.log(`\nBest-four standings, ${category === 'MALE' ? 'men' : 'ladies'} (top 5):`);
      for (const standing of standings) {
        console.log(
          `  ${String(standing.position).padStart(2)}. ` +
            `${(runnerName.get(standing.runnerId) ?? standing.runnerId).padEnd(18)} ` +
            `${String(standing.bestFourTotal).padStart(3)} pts ` +
            `from ${standing.roundsCompleted} round(s)${standing.tied ? '  (tied)' : ''}`,
        );
      }
    }

    const loaded = plan.reduce((n, p) => n + p.entries.length, 0);
    console.log(
      `\n${loaded} result(s) loaded across ${plan.length} round(s)` +
        (skipped > 0 ? `, ${skipped} round(s) skipped` : '') +
        '.\n' +
        'Round publication state was not changed. Publish in /admin when you are ready;\n' +
        'the public season page shows published rounds only.\n',
    );

    if (scoring.problems.length > 0) {
      console.warn(
        `warning: ${scoring.problems.length} result(s) could not be age-graded. ` +
          'Usually a date of birth outside the WMA tables.\n',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nImport failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
