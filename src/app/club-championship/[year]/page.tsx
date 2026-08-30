import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChampionshipTable } from '@/components/ChampionshipTable';
import { EmptyState } from '@/components/EmptyState';
import { LastUpdated } from '@/components/LastUpdated';
import { ChampionshipExplainer } from '@/components/ScoringExplainer';
import { formatShortDate } from '@/lib/dates';
import { CHAMPIONSHIP_COUNTING_RACES, CHAMPIONSHIP_QUALIFYING_RACES } from '@/domain/scoring/types';
import {
  getPublicChampionshipView,
  listPublishedChampionshipYears,
} from '@/services/public-queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  return { title: `Club Championship ${year}` };
}

export default async function ChampionshipYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) notFound();

  const [view, years] = await Promise.all([
    getPublicChampionshipView(year),
    listPublishedChampionshipYears(),
  ]);
  if (!view) notFound();

  const anyEligible =
    view.standings.MALE.some((row) => row.eligible) ||
    view.standings.FEMALE.some((row) => row.eligible);
  const anyRunners = view.standings.MALE.length > 0 || view.standings.FEMALE.length > 0;

  return (
    <div className="shell pad-block stack-lg">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <p className="eyebrow">Club championship</p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', textTransform: 'uppercase' }}>
          {view.name}
        </h1>
        <p className="muted">
          {view.races.length} qualifying race{view.races.length === 1 ? '' : 's'} ·{' '}
          {CHAMPIONSHIP_QUALIFYING_RACES} needed to qualify · lowest {CHAMPIONSHIP_COUNTING_RACES}{' '}
          scores count
        </p>
        <LastUpdated at={view.lastUpdatedAt} />
      </header>

      {years.length > 1 ? (
        <nav aria-label="Championship year">
          <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Choose a year
          </p>
          <ul className="chips">
            {years.map((candidate) => (
              <li key={candidate}>
                <Link
                  href={`/club-championship/${candidate}`}
                  className="chip"
                  aria-current={candidate === view.year ? 'page' : undefined}
                >
                  {candidate}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {!anyRunners ? (
        <EmptyState title="No qualifying results recorded yet">
          <p>Standings appear once club placings have been entered for a qualifying race.</p>
        </EmptyState>
      ) : (
        <>
          {!anyEligible ? (
            <div className="notice notice--info">
              <p className="notice__title">Early in the season</p>
              <p>
                Nobody has completed {CHAMPIONSHIP_QUALIFYING_RACES} qualifying races yet, so there
                are no championship positions to award. Everyone&rsquo;s progress is shown below.
              </p>
            </div>
          ) : null}

          <section aria-labelledby="men-heading">
            <div className="section-head">
              <h2 id="men-heading">Men</h2>
            </div>
            <ChampionshipTable
              rows={view.standings.MALE}
              races={view.races}
              caption={`Men’s club championship ${view.year}`}
            />
          </section>

          <section aria-labelledby="women-heading">
            <div className="section-head">
              <h2 id="women-heading">Women</h2>
            </div>
            <ChampionshipTable
              rows={view.standings.FEMALE}
              races={view.races}
              caption={`Women’s club championship ${view.year}`}
            />
          </section>

          <section aria-labelledby="races-key-heading">
            <div className="section-head">
              <h2 id="races-key-heading">Qualifying races</h2>
            </div>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: '0.5rem' }}>
              {view.races.map((race) => (
                <li key={race.id} className="split">
                  <span>
                    <strong>{race.shortLabel}</strong> — {race.name}
                  </span>
                  <span className="muted">{formatShortDate(race.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <ChampionshipExplainer />
    </div>
  );
}
