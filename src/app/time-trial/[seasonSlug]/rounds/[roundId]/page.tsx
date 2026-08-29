import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bib } from '@/components/Bib';
import { TimeTrialExplainer } from '@/components/ScoringExplainer';
import { formatLongDate } from '@/lib/dates';
import { formatElapsedTime, formatKilometres } from '@/domain/scoring';
import { getPublicRoundView, type PublicSeasonResultRow } from '@/services/public-queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seasonSlug: string; roundId: string }>;
}) {
  const { seasonSlug, roundId } = await params;
  const view = await getPublicRoundView(seasonSlug, roundId);
  return { title: view ? `Round ${view.round.ordinal} · ${view.season.name}` : 'Round' };
}

export default async function RoundPage({
  params,
}: {
  params: Promise<{ seasonSlug: string; roundId: string }>;
}) {
  const { seasonSlug, roundId } = await params;
  const view = await getPublicRoundView(seasonSlug, roundId);
  if (!view) notFound();

  return (
    <div className="shell pad-block stack-lg">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <p className="eyebrow">
          <Link href={`/time-trial/${view.season.slug}`}>{view.season.name}</Link>
        </p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', textTransform: 'uppercase' }}>
          Round {view.round.ordinal}
        </h1>
        <p className="muted">
          {formatLongDate(view.round.date)} · {view.round.resultCount} finisher
          {view.round.resultCount === 1 ? '' : 's'} · {view.improverCount} improver
          {view.improverCount === 1 ? '' : 's'}
        </p>
      </header>

      <RoundTable
        title={`Two laps · ${formatKilometres(view.byDistance.TWO_LAP.metres)}`}
        rows={view.byDistance.TWO_LAP.rows}
      />
      <RoundTable
        title={`Three laps · ${formatKilometres(view.byDistance.THREE_LAP.metres)}`}
        rows={view.byDistance.THREE_LAP.rows}
      />

      <TimeTrialExplainer />
    </div>
  );
}

function RoundTable({ title, rows }: { title: string; rows: readonly PublicSeasonResultRow[] }) {
  const headingId = title.toLowerCase().replace(/[^a-z]+/g, '-');

  return (
    <section aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nobody ran this distance in this round.</p>
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${title} results — scrollable table`}
        >
          <table>
            <caption>
              {title}. Round total is finishing points plus improvement points. A dash in the
              previous-grade column means there was no comparable earlier result at this distance in
              this season, so no improvement points could be earned.
            </caption>
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">Runner</th>
                <th scope="col" className="num nowrap">
                  Time
                </th>
                <th scope="col" className="num">
                  <abbr title="Finishing points">Fin</abbr>
                </th>
                <th scope="col" className="num nowrap">
                  Age grade
                </th>
                <th scope="col" className="num nowrap">
                  Previous
                </th>
                <th scope="col" className="num nowrap">
                  Change
                </th>
                <th scope="col" className="num">
                  <abbr title="Improvement points">Imp</abbr>
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.runner.id}>
                  <td>
                    <Bib
                      position={row.position}
                      tied={row.tiedOnTime}
                      tone={row.position === 1 ? 'green' : 'quiet'}
                      size="sm"
                    />
                  </td>
                  <th scope="row" style={{ fontWeight: 600 }} className="nowrap">
                    {row.runner.displayName}
                  </th>
                  <td className="num nowrap">{formatElapsedTime(row.elapsedMilliseconds)}</td>
                  <td className="num">{row.finishingPoints}</td>
                  <td className="num nowrap">
                    {row.ageGradePercent === null ? '—' : `${row.ageGradePercent.toFixed(2)}%`}
                  </td>
                  <td className="num nowrap">
                    {row.previousAgeGradePercent === null ? (
                      <>
                        <span aria-hidden="true" className="absent">
                          —
                        </span>
                        <span className="visually-hidden">no comparable earlier result</span>
                      </>
                    ) : (
                      `${row.previousAgeGradePercent.toFixed(2)}%`
                    )}
                  </td>
                  <td className="num nowrap">
                    {row.improvement === null ? (
                      <span className="absent" aria-hidden="true">
                        —
                      </span>
                    ) : (
                      <span style={{ fontWeight: row.improvement > 0 ? 700 : 400 }}>
                        {row.improvement > 0 ? '+' : ''}
                        {row.improvement.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="num">{row.improvementPoints}</td>
                  <td className="num" style={{ fontWeight: 800 }}>
                    {row.roundTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
