import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { LastUpdated } from '@/components/LastUpdated';
import { ProgressionChart } from '@/components/ProgressionChart';
import { SeasonStandingsTable } from '@/components/SeasonStandingsTable';
import { TimeTrialExplainer } from '@/components/ScoringExplainer';
import { formatShortDate } from '@/lib/dates';
import { formatKilometres } from '@/domain/scoring';
import { getPublicSeasonView, listPublishedSeasons } from '@/services/public-queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ seasonSlug: string }> }) {
  const { seasonSlug } = await params;
  const view = await getPublicSeasonView(seasonSlug);
  return { title: view ? view.season.name : 'Time Trial' };
}

export default async function SeasonPage({ params }: { params: Promise<{ seasonSlug: string }> }) {
  const { seasonSlug } = await params;
  const [view, seasons] = await Promise.all([
    getPublicSeasonView(seasonSlug),
    listPublishedSeasons(),
  ]);

  if (!view) notFound();

  const publishedRounds = view.rounds.filter((round) => round.published);
  const roundOrdinals = publishedRounds.map((round) => round.ordinal);
  const hasResults = view.standings.MALE.length > 0 || view.standings.FEMALE.length > 0;

  return (
    <div className="shell pad-block stack-lg">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <p className="eyebrow">Time trial · {view.season.clubYearLabel}</p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', textTransform: 'uppercase' }}>
          {view.season.name}
        </h1>
        <p className="muted">
          {formatShortDate(view.season.startDate)} – {formatShortDate(view.season.endDate)} · Two
          laps {formatKilometres(view.season.twoLapMetres)} · Three laps{' '}
          {formatKilometres(view.season.threeLapMetres)}
        </p>
        <LastUpdated at={view.season.lastUpdatedAt} />
      </header>

      {seasons.length > 1 ? (
        <nav aria-label="Season">
          <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Choose a season
          </p>
          <ul className="chips">
            {seasons.map((season) => (
              <li key={season.id}>
                <Link
                  href={`/time-trial/${season.slug}`}
                  className="chip"
                  aria-current={season.slug === view.season.slug ? 'page' : undefined}
                >
                  {season.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <section aria-labelledby="rounds-heading">
        <div className="section-head">
          <h2 id="rounds-heading">Rounds</h2>
        </div>
        <ul className="chips">
          {view.rounds.map((round) => (
            <li key={round.id}>
              {round.published ? (
                <Link href={`/time-trial/${view.season.slug}/rounds/${round.id}`} className="chip">
                  Round {round.ordinal}
                  <span className="muted" style={{ marginLeft: '0.4rem' }}>
                    {formatShortDate(round.date)}
                  </span>
                </Link>
              ) : (
                <span className="chip" aria-disabled="true" style={{ opacity: 0.65 }}>
                  Round {round.ordinal}
                  <span className="muted" style={{ marginLeft: '0.4rem' }}>
                    {formatShortDate(round.date)} · to come
                  </span>
                </span>
              )}
            </li>
          ))}
          {view.rounds.length === 0 ? <li className="muted">No round dates set yet.</li> : null}
        </ul>
      </section>

      {hasResults ? (
        <>
          <section aria-labelledby="men-heading">
            <div className="section-head">
              <h2 id="men-heading">Men&rsquo;s standings</h2>
            </div>
            <SeasonStandingsTable
              rows={view.standings.MALE}
              roundOrdinals={roundOrdinals}
              caption="Men’s best-four season standings"
            />
          </section>

          <section aria-labelledby="women-heading">
            <div className="section-head">
              <h2 id="women-heading">Women&rsquo;s standings</h2>
            </div>
            <SeasonStandingsTable
              rows={view.standings.FEMALE}
              roundOrdinals={roundOrdinals}
              caption="Women’s best-four season standings"
            />
          </section>

          <section aria-labelledby="progression-heading">
            <div className="section-head">
              <h2 id="progression-heading">Age-grade progression</h2>
            </div>
            <ProgressionChart entries={view.progression} />
          </section>
        </>
      ) : (
        <EmptyState title="No rounds published yet in this season">
          <p>Standings appear as soon as the first round is published.</p>
        </EmptyState>
      )}

      <TimeTrialExplainer />
    </div>
  );
}
