import Link from 'next/link';
import { Bib } from '@/components/Bib';
import { ContourBackdrop } from '@/components/ContourBackdrop';
import { EmptyState } from '@/components/EmptyState';
import { LastUpdated } from '@/components/LastUpdated';
import { getConfig } from '@/lib/config';
import { formatLongDate } from '@/lib/dates';
import { getHomeView, type HomeLeader, type PublicRace } from '@/services/public-queries';

/**
 * Home: an at-a-glance answer to the three questions members actually open the
 * app for, each linking straight to the full table. Every leader card is one
 * tap from here, so the current standings are always within two taps of arrival.
 */

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const config = getConfig();
  const view = await getHomeView();

  return (
    <>
      <section className="hero">
        <ContourBackdrop />
        <div className="shell hero__inner">
          <p className="eyebrow" style={{ color: 'rgb(255 255 255 / 0.75)' }}>
            Portland · Dorset
          </p>
          <h1>Royal Manor of Portland Athletic Club</h1>
          <p className="hero__lede">{config.welcomeCopy}</p>
        </div>
      </section>

      <div className="shell pad-block stack-lg">
        <section className="reveal" aria-labelledby="next-race-heading">
          <div className="section-head">
            <h2 id="next-race-heading">Next race</h2>
            <Link href="/races" className="btn btn--ghost btn--sm">
              All races →
            </Link>
          </div>
          {view.nextRace ? (
            <NextRaceCard race={view.nextRace} />
          ) : (
            <EmptyState title="No races scheduled yet">
              <p>
                When the next league fixture or qualifying race is confirmed it will appear here.
              </p>
            </EmptyState>
          )}
        </section>

        <section className="reveal" aria-labelledby="time-trial-heading">
          <div className="section-head">
            <h2 id="time-trial-heading">Time trial</h2>
            {view.timeTrialSeasonSlug ? (
              <Link href="/time-trial" className="btn btn--ghost btn--sm">
                Full standings →
              </Link>
            ) : null}
          </div>

          {view.latestRound ? (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="split">
                <div>
                  <p className="eyebrow">Latest published round</p>
                  <p style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
                    Round {view.latestRound.ordinal} · {view.latestRound.seasonName}
                  </p>
                  <p className="muted">
                    {formatLongDate(view.latestRound.date)} · {view.latestRound.resultCount} result
                    {view.latestRound.resultCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Link
                  href={`/time-trial/${view.latestRound.seasonSlug}/rounds/${view.latestRound.roundId}`}
                  className="btn btn--secondary btn--sm"
                >
                  View round
                </Link>
              </div>
            </div>
          ) : null}

          {view.timeTrialLeaders.MALE || view.timeTrialLeaders.FEMALE ? (
            <div className="grid grid--2">
              <LeaderCard
                heading="Leading man"
                leader={view.timeTrialLeaders.MALE}
                unit="best-four total"
                href="/time-trial"
              />
              <LeaderCard
                heading="Leading woman"
                leader={view.timeTrialLeaders.FEMALE}
                unit="best-four total"
                href="/time-trial"
              />
            </div>
          ) : (
            <EmptyState title="No time-trial results published yet">
              <p>Standings appear as soon as the first round of the season is published.</p>
            </EmptyState>
          )}
        </section>

        <section className="reveal" aria-labelledby="championship-heading">
          <div className="section-head">
            <h2 id="championship-heading">Club championship</h2>
            {view.championshipYear ? (
              <Link href="/club-championship" className="btn btn--ghost btn--sm">
                Full table →
              </Link>
            ) : null}
          </div>

          {view.championshipEarlySeason ? (
            <div className="notice notice--info">
              <p className="notice__title">Early in the {view.championshipYear} championship</p>
              <p>
                Nobody has completed six qualifying races yet, so there are no standings to show.
                Everyone&rsquo;s progress towards the six they need is on the{' '}
                <Link href="/club-championship">championship page</Link>.
              </p>
            </div>
          ) : view.championshipLeaders.MALE || view.championshipLeaders.FEMALE ? (
            <div className="grid grid--2">
              <LeaderCard
                heading="Leading man"
                leader={view.championshipLeaders.MALE}
                unit="best-six total (lowest wins)"
                href="/club-championship"
                tone="purple"
              />
              <LeaderCard
                heading="Leading woman"
                leader={view.championshipLeaders.FEMALE}
                unit="best-six total (lowest wins)"
                href="/club-championship"
                tone="purple"
              />
            </div>
          ) : (
            <EmptyState title="No championship published yet">
              <p>The championship table appears once qualifying races have been marked up.</p>
            </EmptyState>
          )}
        </section>

        <section className="reveal card" aria-labelledby="fundraising-heading">
          <p className="eyebrow">Fundraising</p>
          <h2 id="fundraising-heading" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Supporting PSPA
          </h2>
          <p className="prose">{config.fundraisingCopy}</p>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Donations are handled entirely by JustGiving. This site never takes a payment or stores
            any donor information.
          </p>
        </section>

        <LastUpdated at={view.lastUpdatedAt} />
      </div>
    </>
  );
}

function LeaderCard({
  heading,
  leader,
  unit,
  href,
  tone = 'green',
}: {
  heading: string;
  leader: HomeLeader | null;
  unit: string;
  href: string;
  tone?: 'green' | 'purple';
}) {
  return (
    <div className="card">
      <p className="eyebrow">{heading}</p>
      {leader ? (
        <>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}
          >
            <Bib position={1} tone={tone} />
            <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {leader.runner.displayName}
            </span>
          </div>
          <p className="muted">
            {leader.detail} — {unit}
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <Link href={href}>See the whole table</Link>
          </p>
        </>
      ) : (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          No leader yet.
        </p>
      )}
    </div>
  );
}

function NextRaceCard({ race }: { race: PublicRace }) {
  return (
    <div className="card">
      <div className="split">
        <div className="stack" style={{ gap: '0.35rem' }}>
          <h3 style={{ fontSize: '1.25rem' }}>{race.name}</h3>
          <p style={{ fontWeight: 600 }}>
            {formatLongDate(race.date)}
            {race.startTime ? ` · ${race.startTime}` : ''}
          </p>
          <p className="muted">
            {[race.locationName, race.distanceLabel, race.leagueName].filter(Boolean).join(' · ') ||
              'Details to follow'}
          </p>
          <div className="btn-row" style={{ marginTop: '0.35rem' }}>
            {race.isChampionshipQualifier ? (
              <span className="tag tag--purple">★ Championship qualifier</span>
            ) : null}
            {race.status !== 'SCHEDULED' ? (
              <span className="tag tag--warn">{titleCase(race.status)}</span>
            ) : null}
          </div>
        </div>
        <Link href="/races" className="btn btn--primary btn--sm">
          Race details
        </Link>
      </div>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
