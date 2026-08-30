import Link from 'next/link';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { formatShortDate, formatTimestamp } from '@/lib/dates';
import { computeSeasonScoring } from '@/services/time-trials';
import { todayCalendar } from '@/lib/dates';
import { ScrollableTable } from '@/components/ScrollableTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard' };

/**
 * Admin dashboard.
 *
 * Answers "what needs doing next?" rather than showing vanity counts: unpublished
 * rounds, races with no placings entered, upcoming fixtures, and any validation
 * problem that would block a publication.
 */
export default async function AdminDashboardPage() {
  await requireActorOrRedirect('/admin');

  const today = todayCalendar();

  const [
    runnerCount,
    draftRounds,
    draftRaces,
    upcomingRaces,
    qualifiersMissingResults,
    recentAudit,
    seasons,
  ] = await Promise.all([
    prisma.runner.count({ where: { status: 'ACTIVE' } }),
    prisma.ttRound.findMany({
      where: { state: 'DRAFT' },
      orderBy: { date: 'asc' },
      include: {
        season: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
    }),
    prisma.race.count({ where: { state: 'DRAFT' } }),
    prisma.race.findMany({
      where: { state: 'PUBLISHED', date: { gte: today } },
      orderBy: { date: 'asc' },
      take: 3,
      select: { id: true, name: true, date: true, startTime: true },
    }),
    prisma.race.findMany({
      where: {
        isChampionshipQualifier: true,
        date: { lt: today },
        championshipResults: { none: {} },
      },
      orderBy: { date: 'desc' },
      take: 5,
      select: { id: true, name: true, date: true },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { displayName: true } } },
    }),
    prisma.ttSeason.findMany({
      orderBy: { startDate: 'desc' },
      take: 3,
      select: { id: true, name: true, state: true },
    }),
  ]);

  // Surface anything that would block a publish, before the volunteer clicks it.
  const blockingProblems = (
    await Promise.all(
      seasons.map(async (season) => {
        const scoring = await computeSeasonScoring(season.id, { publishedOnly: false });
        return scoring.problems.map((problem) => ({ season: season.name, ...problem }));
      }),
    )
  ).flat();

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Dashboard</h1>
      </header>

      <section className="card" aria-labelledby="at-a-glance">
        <h2 id="at-a-glance" className="visually-hidden">
          At a glance
        </h2>
        <div className="stat-row">
          <div className="stat">
            <p className="stat__value">{runnerCount}</p>
            <p className="stat__label">Active runners</p>
          </div>
          <div className="stat">
            <p className="stat__value">{draftRounds.length}</p>
            <p className="stat__label">Unpublished rounds</p>
          </div>
          <div className="stat">
            <p className="stat__value">{draftRaces}</p>
            <p className="stat__label">Unpublished races</p>
          </div>
          <div className="stat">
            <p className="stat__value">{qualifiersMissingResults.length}</p>
            <p className="stat__label">Qualifiers awaiting results</p>
          </div>
        </div>
      </section>

      {blockingProblems.length > 0 ? (
        <section className="notice notice--error" aria-labelledby="problems-heading">
          <p className="notice__title" id="problems-heading">
            {blockingProblems.length} result(s) cannot be scored
          </p>
          <p>These must be fixed before the round containing them can be published.</p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
            {blockingProblems.slice(0, 6).map((problem, index) => (
              <li key={index}>
                {problem.season}: {problem.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="next-actions">
        <div className="section-head">
          <h2 id="next-actions">Next actions</h2>
        </div>

        <div className="admin-grid admin-grid--halves">
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Rounds to finish</h3>
            {draftRounds.length === 0 ? (
              <p className="muted">Every round is published.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: '0.5rem' }}>
                {draftRounds.map((round) => (
                  <li key={round.id} className="split">
                    <span>
                      <Link href={`/admin/time-trials/${round.season.id}/rounds/${round.id}`}>
                        Round {round.ordinal} — {round.season.name}
                      </Link>
                      <span className="muted"> · {formatShortDate(round.date)}</span>
                    </span>
                    <span className="tag">
                      {round._count.results} result{round._count.results === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
              Qualifiers awaiting club placings
            </h3>
            {qualifiersMissingResults.length === 0 ? (
              <p className="muted">All past qualifying races have placings entered.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: '0.5rem' }}>
                {qualifiersMissingResults.map((race) => (
                  <li key={race.id} className="split">
                    <Link href={`/admin/races/${race.id}`}>{race.name}</Link>
                    <span className="muted">{formatShortDate(race.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Upcoming races</h3>
            {upcomingRaces.length === 0 ? (
              <p className="muted">
                Nothing published. <Link href="/admin/races">Add a race</Link>.
              </p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: '0.5rem' }}>
                {upcomingRaces.map((race) => (
                  <li key={race.id} className="split">
                    <Link href={`/admin/races/${race.id}`}>{race.name}</Link>
                    <span className="muted">
                      {formatShortDate(race.date)}
                      {race.startTime ? ` · ${race.startTime}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Seasons</h3>
            {seasons.length === 0 ? (
              <p className="muted">
                No seasons yet. <Link href="/admin/time-trials">Create the first one</Link>.
              </p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: '0.5rem' }}>
                {seasons.map((season) => (
                  <li key={season.id} className="split">
                    <Link href={`/admin/time-trials/${season.id}`}>{season.name}</Link>
                    <span className={`tag${season.state === 'PUBLISHED' ? ' tag--green' : ''}`}>
                      {season.state === 'PUBLISHED' ? '✓ Published' : titleCase(season.state)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="section-head">
          <h2 id="recent-heading">Recent changes</h2>
        </div>
        {recentAudit.length === 0 ? (
          <p className="muted">Nothing has been changed yet.</p>
        ) : (
          <ScrollableTable label="Recent administrator changes">
            <table>
              <caption>The last eight administrator actions recorded in the audit log.</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.map((event) => (
                  <tr key={event.id}>
                    <td className="nowrap">{formatTimestamp(event.createdAt)}</td>
                    <td>{event.actor?.displayName ?? 'Removed account'}</td>
                    <td>
                      <code>{event.action}</code>
                    </td>
                    <td>{event.entityType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
