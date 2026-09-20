/**
 * Loads the 2026 club-championship race placings from the reviewed CSV.
 *
 * Input:  data/championship-2026-club-results.csv
 * Source: the 2026 race results themselves — the DRRL league database, the
 *         Portland Coastal PDFs, the Egdon Easy 10k results and the Hardy's
 *         Half PDF. Club-affiliated entries only: every row is somebody
 *         recorded under a Royal Manor of Portland club entry. Nobody was
 *         matched on name alone.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AND IS NOT DERIVED HERE
 * ---------------------------------------------------------------------------
 *
 * `championship_result` holds two numbers: `categoryPosition` and `score`. In
 * v1 the score IS the position — see the comment in saveRaceResults() in
 * src/services/championships.ts — so there is no hidden scoring step to
 * reproduce, and this script sets them exactly as that function does.
 *
 * `categoryPosition` comes from the CSV, where it was computed by ranking the
 * club's own finishers of that category by time within each race. The standings
 * printed at the end are produced by computeChampionshipScoring(), the
 * application's own function, not by anything in this file.
 *
 * saveRaceResults() itself cannot be called from a script: it starts with
 * requireActor(), which needs an admin session.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   # Dry run. Writes nothing. Do this first.
 *   DATABASE_URL="...?sslmode=require" npx tsx scripts/import-championship-results-2026.ts
 *
 *   # Apply.
 *   DATABASE_URL="...?sslmode=require" npx tsx scripts/import-championship-results-2026.ts --apply
 *
 * Options:
 *   --csv=<path>   Override the input file.
 *   --replace      Overwrite races that already hold championship results.
 *
 * Run the two SQL scripts first, or this will stop and tell you to:
 *   scripts/sql/add-club-runners-2026.sql        (the runners who are missing)
 *   scripts/sql/correct-dob-brackets-2026.sql    (age-bracket dates of birth)
 *
 * Publication state is not changed. Nothing reaches the public championship
 * table until you publish it in /admin.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { computeChampionshipScoring } from '../src/services/championships';
import { normaliseSearchName } from '../src/services/runners';
import { SCORING_RULES_VERSION } from '../src/domain/scoring';

/** Minimal RFC 4180 reader — the notes column contains quoted commas. */
function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) throw new Error('The CSV is empty.');
  return body
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

interface Options {
  readonly apply: boolean;
  readonly replace: boolean;
  readonly csvPath: string;
}

function readOptions(argv: readonly string[]): Options {
  const csvArg = argv.find((a) => a.startsWith('--csv='));
  return {
    apply: argv.includes('--apply'),
    replace: argv.includes('--replace'),
    csvPath: csvArg ? csvArg.slice('--csv='.length) : 'data/championship-2026-club-results.csv',
  };
}

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

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }
  console.log(`\nDatabase: ${describeTarget(connectionString)}`);

  const all = readCsv(readFileSync(options.csvPath, 'utf8'));
  const rows = all.filter((r) => r.is_championship_qualifier === 'yes');
  console.log(
    `CSV: ${options.csvPath} — ${all.length} rows, ${rows.length} in championship races ` +
      `(${all.length - rows.length} excluded as non-championship races)`,
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // -- Resolve races -------------------------------------------------------

    const slugs = [...new Set(rows.map((r) => r.race_slug as string))];
    const races = await prisma.race.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        name: true,
        date: true,
        isChampionshipQualifier: true,
        championshipId: true,
        _count: { select: { championshipResults: true } },
      },
    });
    const raceBySlug = new Map(races.map((race) => [race.slug, race]));

    const missingRaces = slugs.filter((s) => !raceBySlug.has(s));
    if (missingRaces.length > 0) {
      console.error(
        `\n${missingRaces.length} race(s) in the CSV are not in the database:\n` +
          missingRaces.map((s) => `  ${s}`).join('\n') +
          '\nRun scripts/sql/club-championship-2026-races.sql first.\n',
      );
      process.exit(1);
    }
    const notQualifiers = races.filter((r) => !r.isChampionshipQualifier);
    if (notQualifiers.length > 0) {
      console.error(
        `\nThese races are not marked as championship qualifiers, so results cannot be\n` +
          `attached to them:\n${notQualifiers.map((r) => `  ${r.name}`).join('\n')}\n`,
      );
      process.exit(1);
    }

    // -- Resolve runners -----------------------------------------------------

    const people = [...new Set(rows.map((r) => r.canonical_person as string))].filter(Boolean);
    if (people.length !== new Set(rows.map((r) => r.canonical_person)).size) {
      console.error('\nSome rows have no canonical_person. Fix the CSV first.\n');
      process.exit(1);
    }
    const searchNameOf = new Map(
      people.map((p) => {
        const [given, ...rest] = p.split(' ');
        return [p, normaliseSearchName(given as string, rest.join(' '))];
      }),
    );
    const runnerRows = await prisma.runner.findMany({
      where: { searchName: { in: [...searchNameOf.values()] }, status: { not: 'MERGED' } },
      select: { id: true, searchName: true, givenName: true, familyName: true, category: true },
    });
    const bySearchName = new Map<string, (typeof runnerRows)[number]>();
    const ambiguous: string[] = [];
    for (const runner of runnerRows) {
      if (bySearchName.has(runner.searchName)) ambiguous.push(runner.searchName);
      bySearchName.set(runner.searchName, runner);
    }

    const unknown = people.filter((p) => !bySearchName.has(searchNameOf.get(p) as string));
    if (unknown.length > 0) {
      console.error(
        `\n${unknown.length} runner(s) in the CSV have no record:\n` +
          unknown.map((p) => `  ${p}`).join('\n') +
          '\nRun scripts/sql/add-club-runners-2026.sql first.\n',
      );
      process.exit(1);
    }
    if (ambiguous.length > 0) {
      console.error(`\nMore than one active runner matches: ${ambiguous.join(', ')}.\n`);
      process.exit(1);
    }

    // The stored category is what the result is filed under, so a disagreement
    // with the sex printed in the results would file it in the wrong table.
    const categoryProblems = rows.filter((r) => {
      const runner = bySearchName.get(searchNameOf.get(r.canonical_person as string) as string);
      return runner && runner.category !== r.sex;
    });
    if (categoryProblems.length > 0) {
      console.error('\nScoring category disagrees with the sex printed in the results:');
      for (const r of categoryProblems) {
        const runner = bySearchName.get(searchNameOf.get(r.canonical_person as string) as string);
        console.error(
          `  ${r.canonical_person}: we hold ${runner?.category}, ${r.source_race_name} says ${r.sex}`,
        );
      }
      console.error('Fix the runner record in /admin, then run again.\n');
      process.exit(1);
    }

    // -- Build and check the plan -------------------------------------------

    interface Entry {
      readonly runnerId: string;
      readonly person: string;
      readonly category: 'MALE' | 'FEMALE';
      readonly categoryPosition: number;
    }
    const plan: { slug: string; name: string; existing: number; entries: Entry[] }[] = [];

    for (const slug of slugs) {
      const race = raceBySlug.get(slug)!;
      const entries = rows
        .filter((r) => r.race_slug === slug)
        .map((r) => {
          const runner = bySearchName.get(
            searchNameOf.get(r.canonical_person as string) as string,
          )!;
          return {
            runnerId: runner.id,
            person: r.canonical_person as string,
            category: r.sex as 'MALE' | 'FEMALE',
            categoryPosition: Number(r.club_category_position),
          };
        });

      const seen = new Set<string>();
      for (const e of entries) {
        if (seen.has(e.runnerId)) {
          throw new Error(`${e.person} appears twice in ${race.name}.`);
        }
        seen.add(e.runnerId);
      }
      // Positions must be 1..n within each category, or the standings are wrong.
      for (const category of ['MALE', 'FEMALE'] as const) {
        const positions = entries
          .filter((e) => e.category === category)
          .map((e) => e.categoryPosition)
          .sort((a, b) => a - b);
        const expected = positions.map((_, i) => i + 1);
        if (positions.join(',') !== expected.join(',')) {
          throw new Error(
            `${race.name}, ${category}: club positions are ${positions.join(', ')}, expected ${expected.join(', ')}.`,
          );
        }
      }
      plan.push({ slug, name: race.name, existing: race._count.championshipResults, entries });
    }

    console.log(`\n${options.apply ? 'Loading' : 'Would load'}:`);
    const toWrite: typeof plan = [];
    let skipped = 0;
    for (const item of plan.sort(
      (a, b) =>
        (raceBySlug.get(a.slug)!.date as Date).getTime() -
        (raceBySlug.get(b.slug)!.date as Date).getTime(),
    )) {
      const men = item.entries.filter((e) => e.category === 'MALE').length;
      if (item.existing > 0 && !options.replace) {
        console.log(
          `  ${item.name.padEnd(24)} SKIPPED — already holds ${item.existing} result(s). Use --replace.`,
        );
        skipped += 1;
        continue;
      }
      console.log(
        `  ${item.name.padEnd(24)} ${String(item.entries.length).padStart(2)} placings ` +
          `(${men} men, ${item.entries.length - men} ladies)` +
          (item.existing > 0 ? `  — replacing ${item.existing}` : ''),
      );
      toWrite.push(item);
    }

    if (!options.apply) {
      console.log(
        `\nDry run. Nothing was written.\n` +
          `Re-run with --apply to load ${toWrite.reduce((n, p) => n + p.entries.length, 0)} placing(s).\n`,
      );
      return;
    }
    if (toWrite.length === 0) {
      console.log('\nNothing to do.\n');
      return;
    }

    // -- Write ---------------------------------------------------------------

    const championshipId = races.find((r) => r.championshipId)?.championshipId;
    if (!championshipId) {
      console.error('\nNone of these races is linked to a championship.\n');
      process.exit(1);
    }

    await prisma.$transaction(async (tx) => {
      for (const item of toWrite) {
        const raceId = raceBySlug.get(item.slug)!.id;
        await tx.championshipResult.deleteMany({ where: { raceId } });
        await tx.championshipResult.createMany({
          data: item.entries.map((e) => ({
            raceId,
            runnerId: e.runnerId,
            category: e.category,
            categoryPosition: e.categoryPosition,
            // v1: the score is the position. Set the same way saveRaceResults does.
            score: e.categoryPosition,
            scoringRulesVersion: SCORING_RULES_VERSION,
          })),
        });
      }
      await tx.auditEvent.create({
        data: {
          action: 'championship.result_entered',
          entityType: 'Championship',
          entityId: championshipId,
          summary: {
            source: '2026 race results, club-affiliated entries only',
            races: toWrite.map((i) => ({ race: i.name, placings: i.entries.length })),
            importedBy: 'scripts/import-championship-results-2026.ts',
          },
        },
      });
    });

    // -- Show what the scorer produced --------------------------------------

    const scoring = await computeChampionshipScoring(
      championshipId,
      { publishedOnly: false },
      prisma,
    );
    const nameById = new Map(runnerRows.map((r) => [r.id, `${r.givenName} ${r.familyName}`]));

    for (const category of ['MALE', 'FEMALE'] as const) {
      const standings = scoring.standings[category] ?? [];
      if (standings.length === 0) continue;
      console.log(`\nChampionship standings, ${category === 'MALE' ? 'men' : 'ladies'}:`);
      for (const standing of standings.slice(0, 10)) {
        // Position and total are null until a runner has run enough races, which
        // is the expected mid-season state rather than missing data.
        const place = standing.position === null ? ' -' : String(standing.position).padStart(2);
        const total =
          standing.countingTotal === null ? '  -' : String(standing.countingTotal).padStart(3);
        console.log(
          `  ${place}. ${(nameById.get(standing.runnerId) ?? standing.runnerId).padEnd(20)} ` +
            `${total} pts   ${standing.racesCompleted}/${standing.racesRequired} races` +
            `${standing.eligible ? '' : '   (not yet eligible)'}${standing.tied ? '   (tied)' : ''}`,
        );
      }
    }

    const loaded = toWrite.reduce((n, p) => n + p.entries.length, 0);
    console.log(
      `\n${loaded} placing(s) loaded across ${toWrite.length} race(s)` +
        (skipped > 0 ? `, ${skipped} race(s) skipped` : '') +
        '.\nPublication state was not changed; publish in /admin when you are ready.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nImport failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
