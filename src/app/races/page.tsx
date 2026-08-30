import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { formatLongDate } from '@/lib/dates';
import { listPublicRaces, type PublicRace } from '@/services/public-queries';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Races' };

/**
 * Race calendar. Upcoming races come first because that is what a member opening
 * this page on a Thursday evening actually wants.
 */
export default async function RacesPage() {
  const { upcoming, past } = await listPublicRaces();

  return (
    <div className="shell pad-block stack-lg">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <p className="eyebrow">Fixtures</p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', textTransform: 'uppercase' }}>
          Races
        </h1>
        <p className="muted">All times are UK local time (Europe/London).</p>
      </header>

      <section aria-labelledby="upcoming-heading">
        <div className="section-head">
          <h2 id="upcoming-heading">Upcoming</h2>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState title="No races scheduled">
            <p>
              Nothing is on the calendar at the moment. Fixtures appear here as soon as club
              volunteers publish them.
            </p>
          </EmptyState>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {upcoming.map((race) => (
              <li key={race.id}>
                <RaceCard race={race} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past-heading">
          <div className="section-head">
            <h2 id="past-heading">Past races</h2>
          </div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {past.map((race) => (
              <li key={race.id}>
                <RaceCard race={race} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RaceCard({ race }: { race: PublicRace }) {
  const statusTag = {
    SCHEDULED: null,
    COMPLETED: <span className="tag">✓ Completed</span>,
    POSTPONED: <span className="tag tag--warn">⚠ Postponed</span>,
    CANCELLED: <span className="tag tag--danger">✕ Cancelled</span>,
  }[race.status];

  return (
    <article className="card">
      <div className="stack" style={{ gap: '0.5rem' }}>
        <div className="split">
          <h3 style={{ fontSize: '1.1875rem' }}>{race.name}</h3>
          <div className="btn-row">
            {race.isChampionshipQualifier ? (
              <span className="tag tag--purple">★ Championship qualifier</span>
            ) : null}
            {statusTag}
          </div>
        </div>

        <p style={{ fontWeight: 600 }}>
          <time dateTime={race.date.toISOString().slice(0, 10)}>{formatLongDate(race.date)}</time>
          {race.startTime ? <> · {race.startTime}</> : null}
        </p>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.25rem 0.75rem',
            margin: 0,
            fontSize: '0.9375rem',
          }}
        >
          {race.distanceLabel ? (
            <>
              <dt className="eyebrow">Distance</dt>
              <dd style={{ margin: 0 }}>{race.distanceLabel}</dd>
            </>
          ) : null}
          {race.leagueName ? (
            <>
              <dt className="eyebrow">League</dt>
              <dd style={{ margin: 0 }}>{race.leagueName}</dd>
            </>
          ) : null}
          {race.locationName ? (
            <>
              <dt className="eyebrow">Where</dt>
              <dd style={{ margin: 0 }}>
                {race.locationName}
                {race.address ? <span className="muted"> · {race.address}</span> : null}
              </dd>
            </>
          ) : null}
          {race.entryInstructions ? (
            <>
              <dt className="eyebrow">Entry</dt>
              <dd style={{ margin: 0 }}>{race.entryInstructions}</dd>
            </>
          ) : null}
        </dl>

        <div className="btn-row">
          {race.externalUrl ? (
            <a
              className="btn btn--secondary btn--sm"
              href={race.externalUrl}
              target="_blank"
              rel="noopener noreferrer external"
            >
              Race information
              <span className="visually-hidden"> for {race.name} (opens in a new tab)</span>
            </a>
          ) : null}
          {race.mapUrl ? (
            <a
              className="btn btn--secondary btn--sm"
              href={race.mapUrl}
              target="_blank"
              rel="noopener noreferrer external"
            >
              Map
              <span className="visually-hidden"> for {race.name} (opens in a new tab)</span>
            </a>
          ) : null}
          {/* Only offer the championship link when there are results to see. */}
          {race.isChampionshipQualifier && race.hasChampionshipResults && race.championshipYear ? (
            <Link
              className="btn btn--secondary btn--sm"
              href={`/club-championship/${race.championshipYear}`}
            >
              Championship table
              <span className="visually-hidden"> for {race.championshipYear}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
