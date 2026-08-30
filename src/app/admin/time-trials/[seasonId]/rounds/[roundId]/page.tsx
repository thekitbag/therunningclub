import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { formatLongDate } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { ResultEntryGrid } from './ResultEntryGrid';
import { PublicationPanel } from './PublicationPanel';
import { computeSeasonScoring, previewRoundPublication } from '@/services/time-trials';
import { formatElapsedTime } from '@/domain/scoring';
import { ScrollableTable } from '@/components/ScrollableTable';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const round = await prisma.ttRound.findUnique({
    where: { id: roundId },
    select: { ordinal: true },
  });
  return { title: round ? `Round ${round.ordinal}` : 'Round' };
}

/**
 * Result entry for one round.
 *
 * Everything an operator needs is on this page: the entry grid, the scores the
 * current draft would produce, the impact of publishing it, and the publish
 * control itself. Splitting these across pages would mean saving, navigating
 * and losing the mental thread halfway through a sheet of times.
 */
export default async function RoundEntryPage({
  params,
}: {
  params: Promise<{ seasonId: string; roundId: string }>;
}) {
  await requireActorOrRedirect('/admin/time-trials');
  const { seasonId, roundId } = await params;

  const round = await prisma.ttRound.findFirst({
    where: { id: roundId, seasonId },
    include: {
      season: true,
      results: {
        include: { runner: { select: { id: true, givenName: true, familyName: true } } },
        orderBy: { elapsedMilliseconds: 'asc' },
      },
    },
  });
  if (!round) notFound();

  const [runners, scoring, impact] = await Promise.all([
    prisma.runner.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
      select: { id: true, givenName: true, familyName: true, category: true },
    }),
    computeSeasonScoring(seasonId, { publishedOnly: false }),
    previewRoundPublication(roundId),
  ]);

  const scoredRound = scoring.rounds.find((candidate) => candidate.roundId === roundId);
  const namesById = new Map(
    round.results.map((result) => [
      result.runnerId,
      `${result.runner.givenName} ${result.runner.familyName}`,
    ]),
  );

  const previewRows = (scoredRound?.results ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.distanceChoice.localeCompare(b.distanceChoice) ||
        a.finishingPosition - b.finishingPosition,
    )
    .map((result) => ({
      runnerName: namesById.get(result.runnerId) ?? 'Unknown runner',
      distance: result.distanceChoice === 'TWO_LAP' ? 'Two laps' : 'Three laps',
      time: formatElapsedTime(result.elapsedMilliseconds),
      finishingPosition: result.finishingPosition,
      finishingPoints: result.finishingPoints,
      ageGrade: result.ageGradeDisplayPercent,
      previousAgeGrade:
        result.previousAgeGradePercent === null
          ? null
          : Math.round(result.previousAgeGradePercent * 100) / 100,
      improvement: result.improvementDisplay,
      improvementPoints: result.improvementPoints,
      roundTotal: result.roundTotal,
    }));

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">
          <Link href={`/admin/time-trials/${seasonId}`}>{round.season.name}</Link>
        </p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>
          Round {round.ordinal}: {round.name}
        </h1>
        <p className="muted">
          {formatLongDate(round.date)} ·{' '}
          {round.state === 'PUBLISHED' ? 'Published' : 'Draft — not visible to the public'}
        </p>
      </header>

      <ResultEntryGrid
        roundId={roundId}
        runners={runners.map((runner) => ({
          id: runner.id,
          label: `${runner.familyName}, ${runner.givenName}`,
        }))}
        existing={round.results.map((result) => ({
          runnerId: result.runnerId,
          distanceChoice: result.distanceChoice,
          time: formatElapsedTime(result.elapsedMilliseconds, { tenths: true }),
        }))}
        twoLapKm={round.season.twoLapMetres / 1000}
        threeLapKm={round.season.threeLapMetres / 1000}
        csrfField={<CsrfField />}
      />

      <section aria-labelledby="preview-heading">
        <div className="section-head">
          <h2 id="preview-heading">Calculated scores</h2>
          <p className="muted">
            {scoredRound?.improverCount ?? 0} improver
            {(scoredRound?.improverCount ?? 0) === 1 ? '' : 's'} in this round
          </p>
        </div>
        {previewRows.length === 0 ? (
          <p className="muted">
            No results saved yet. Enter times above and save to see how they score.
          </p>
        ) : (
          <ScrollableTable label="Calculated scores">
            <table className="preview-table">
              <caption>
                Scores the saved times produce. These are recalculated from scratch every time you
                save — they are never typed in.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Runner</th>
                  <th scope="col">Distance</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  <th scope="col" className="num">
                    Pos
                  </th>
                  <th scope="col" className="num">
                    Fin
                  </th>
                  <th scope="col" className="num">
                    Age grade
                  </th>
                  <th scope="col" className="num">
                    Previous
                  </th>
                  <th scope="col" className="num">
                    Change
                  </th>
                  <th scope="col" className="num">
                    Imp
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index}>
                    <th scope="row" className="nowrap">
                      {row.runnerName}
                    </th>
                    <td className="nowrap">{row.distance}</td>
                    <td className="num nowrap">{row.time}</td>
                    <td className="num">{row.finishingPosition}</td>
                    <td className="num">{row.finishingPoints}</td>
                    <td className="num">{row.ageGrade === null ? '—' : `${row.ageGrade}%`}</td>
                    <td className="num">
                      {row.previousAgeGrade === null ? (
                        <span title="No comparable earlier result at this distance">—</span>
                      ) : (
                        `${row.previousAgeGrade}%`
                      )}
                    </td>
                    <td className="num">
                      {row.improvement === null
                        ? '—'
                        : `${row.improvement > 0 ? '+' : ''}${row.improvement}`}
                    </td>
                    <td className="num">{row.improvementPoints}</td>
                    <td className="num" style={{ fontWeight: 800 }}>
                      {row.roundTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>

      <PublicationPanel
        roundId={roundId}
        published={round.state === 'PUBLISHED'}
        impact={impact}
        csrfPublish={<CsrfField />}
        csrfUnpublish={<CsrfField />}
      />
    </div>
  );
}
