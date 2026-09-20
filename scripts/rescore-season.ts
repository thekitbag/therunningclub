/**
 * Replays the scoring engine over a season and rewrites its derived columns.
 *
 * Two things make this necessary rather than optional:
 *
 *  1. Editing a runner through /admin recalculates every season they appear in.
 *     Editing one in SQL does not. After
 *     scripts/sql/sync-member-roster-2026.sql replaces the invented dates of
 *     birth with real ones, every stored age grade and improvement score is
 *     stale until this runs.
 *  2. The scoring rules changed to RMPAC_SCORING_V3 (see
 *     docs/scoring-rules-2026.md). Results stored under V2 carry the old
 *     ladders until they are replayed.
 *
 * It calls `recalculateSeason` from src/services/time-trials.ts — the same
 * function the admin screens call. Nothing here computes a score itself.
 *
 * Usage:
 *   # Dry run: reports what would change, writes nothing.
 *   DATABASE_URL="...?sslmode=require" npx tsx scripts/rescore-season.ts
 *
 *   # Apply.
 *   DATABASE_URL="...?sslmode=require" npx tsx scripts/rescore-season.ts --apply
 *
 * Options:
 *   --season=<slug>   Default "summer-2026".
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { computeSeasonScoring, recalculateSeason } from '../src/services/time-trials';
import { formatElapsedTime } from '../src/domain/scoring';

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
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const seasonArg = argv.find((a) => a.startsWith('--season='));
  const slug = seasonArg ? seasonArg.slice('--season='.length) : 'summer-2026';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }
  console.log(`\nDatabase: ${describeTarget(connectionString)}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const season = await prisma.ttSeason.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, type: true, scoringRulesVersion: true },
    });
    if (!season) {
      const all = await prisma.ttSeason.findMany({ select: { slug: true, name: true } });
      console.error(
        `\nNo season with slug "${slug}".` +
          (all.length
            ? `\n${all.map((s) => `  --season=${s.slug}  (${s.name})`).join('\n')}\n`
            : '\n'),
      );
      process.exit(1);
    }

    console.log(
      `Season:   ${season.name} (${season.slug}), stored as ${season.scoringRulesVersion}`,
    );

    const before = await prisma.ttResult.findMany({
      where: { round: { seasonId: season.id } },
      select: {
        runnerId: true,
        roundId: true,
        elapsedMilliseconds: true,
        finishingPoints: true,
        improvementPoints: true,
        roundTotal: true,
        ageGradePercent: true,
        runner: { select: { givenName: true, familyName: true } },
        round: { select: { ordinal: true, name: true } },
      },
    });
    if (before.length === 0) {
      console.log('\nThis season holds no results.\n');
      return;
    }

    // Score without writing, so a dry run can show the exact deltas.
    const scoring = await computeSeasonScoring(season.id, { publishedOnly: false }, prisma);
    const next = new Map(
      scoring.rounds.flatMap((r) => r.results.map((x) => [`${r.roundId}:${x.runnerId}`, x])),
    );

    interface Change {
      name: string;
      round: number;
      time: string;
      fp: [number, number];
      ip: [number, number];
      total: [number, number];
      ag: [number | null, number | null];
    }
    const changes: Change[] = [];
    for (const row of before) {
      const after = next.get(`${row.roundId}:${row.runnerId}`);
      if (!after) continue;
      const oldAg = row.ageGradePercent === null ? null : Number(row.ageGradePercent);
      const newAg = after.ageGradePercent;
      const agMoved =
        (oldAg === null) !== (newAg === null) ||
        (oldAg !== null && newAg !== null && Math.abs(oldAg - newAg) > 0.005);
      if (
        row.finishingPoints !== after.finishingPoints ||
        row.improvementPoints !== after.improvementPoints ||
        row.roundTotal !== after.roundTotal ||
        agMoved
      ) {
        changes.push({
          name: `${row.runner.givenName} ${row.runner.familyName}`,
          round: row.round.ordinal,
          time: formatElapsedTime(row.elapsedMilliseconds),
          fp: [row.finishingPoints, after.finishingPoints],
          ip: [row.improvementPoints, after.improvementPoints],
          total: [row.roundTotal, after.roundTotal],
          ag: [oldAg, newAg],
        });
      }
    }

    console.log(`Results:  ${before.length}, of which ${changes.length} change\n`);
    const fmt = (v: number | null) => (v === null ? '  —  ' : v.toFixed(2).padStart(6));
    console.log('  rd runner               time     finish    improve   total     age grade');
    for (const c of changes.sort((a, b) => a.round - b.round || a.name.localeCompare(b.name))) {
      console.log(
        `  ${String(c.round).padStart(2)} ${c.name.padEnd(20)} ${c.time.padStart(7)}  ` +
          `${String(c.fp[0]).padStart(2)}->${String(c.fp[1]).padStart(2)}    ` +
          `${String(c.ip[0]).padStart(2)}->${String(c.ip[1]).padStart(2)}    ` +
          `${String(c.total[0]).padStart(2)}->${String(c.total[1]).padStart(2)}   ` +
          `${fmt(c.ag[0])} ->${fmt(c.ag[1])}`,
      );
    }

    if (scoring.problems.length > 0) {
      console.warn(
        `\nwarning: ${scoring.problems.length} result(s) cannot be age-graded:\n` +
          scoring.problems.map((p) => `  ${p.runnerId}: ${p.message}`).join('\n'),
      );
    }

    if (!apply) {
      console.log('\nDry run. Nothing was written. Re-run with --apply.\n');
      return;
    }

    const applied = await recalculateSeason(season.id);
    await prisma.ttSeason.update({
      where: { id: season.id },
      data: { scoringRulesVersion: applied.scoringRulesVersion },
    });
    await prisma.auditEvent.create({
      data: {
        action: 'tt.season.recalculated',
        entityType: 'TtSeason',
        entityId: season.id,
        summary: {
          reason: 'Real dates of birth applied and scoring rules updated',
          scoringRulesVersion: applied.scoringRulesVersion,
          resultsChanged: changes.length,
        },
      },
    });

    for (const category of ['MALE', 'FEMALE'] as const) {
      const standings = applied.standings[category] ?? [];
      if (standings.length === 0) continue;
      const names = new Map(
        before.map((b) => [b.runnerId, `${b.runner.givenName} ${b.runner.familyName}`]),
      );
      console.log(`\nBest-four standings, ${category === 'MALE' ? 'men' : 'ladies'} (top 5):`);
      for (const s of standings.slice(0, 5)) {
        console.log(
          `  ${String(s.position).padStart(2)}. ${(names.get(s.runnerId) ?? s.runnerId).padEnd(20)} ` +
            `${String(s.bestFourTotal).padStart(3)} pts from ${s.roundsCompleted} round(s)${s.tied ? '  (tied)' : ''}`,
        );
      }
    }

    console.log(
      `\nRescored ${before.length} result(s) under ${applied.scoringRulesVersion}.\n` +
        'Publication state was not changed.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nRescore failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
