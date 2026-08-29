import Link from 'next/link';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { formatShortDate } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { SeasonForms } from './SeasonForms';
import { defaultSeasonDates } from '@/services/time-trials';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Time trials' };

export default async function TimeTrialsAdminPage() {
  await requireActorOrRedirect('/admin/time-trials');

  const seasons = await prisma.ttSeason.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      rounds: {
        orderBy: { ordinal: 'asc' },
        select: {
          id: true,
          ordinal: true,
          date: true,
          state: true,
          _count: { select: { results: true } },
        },
      },
    },
  });

  const thisYear = new Date().getUTCFullYear();

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Time trials</h1>
        <p className="muted">
          Two six-round seasons a year. Winter runs October to March over 5 km and 7.5 km; summer
          runs April to September over 6 km and 8 km.
        </p>
      </header>

      <SeasonForms
        csrfField={<CsrfField />}
        csrfFieldState={<CsrfField />}
        defaults={{
          winter: defaultSeasonDates('WINTER', thisYear),
          summer: defaultSeasonDates('SUMMER', thisYear),
        }}
        seasons={seasons.map((season) => ({
          id: season.id,
          name: season.name,
          type: season.type,
          state: season.state,
          startDate: formatShortDate(season.startDate),
          endDate: formatShortDate(season.endDate),
          roundCount: season.rounds.length,
          publishedRounds: season.rounds.filter((round) => round.state === 'PUBLISHED').length,
        }))}
      />

      <section aria-labelledby="all-seasons">
        <div className="section-head">
          <h2 id="all-seasons">Seasons</h2>
        </div>
        {seasons.length === 0 ? (
          <p className="muted">No seasons yet. Create one above to get started.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {seasons.map((season) => (
              <li key={season.id} className="card">
                <div className="split">
                  <div>
                    <h3 style={{ fontSize: '1.0625rem' }}>
                      <Link href={`/admin/time-trials/${season.id}`}>{season.name}</Link>
                    </h3>
                    <p className="muted">
                      {formatShortDate(season.startDate)} – {formatShortDate(season.endDate)} ·{' '}
                      {season.rounds.length} of 6 rounds created
                    </p>
                  </div>
                  <span className={`tag${season.state === 'PUBLISHED' ? ' tag--green' : ''}`}>
                    {season.state === 'PUBLISHED' ? '✓ Published' : titleCase(season.state)}
                  </span>
                </div>

                {season.rounds.length > 0 ? (
                  <ul className="chips" style={{ marginTop: '0.75rem' }}>
                    {season.rounds.map((round) => (
                      <li key={round.id}>
                        <Link
                          href={`/admin/time-trials/${season.id}/rounds/${round.id}`}
                          className="chip"
                        >
                          R{round.ordinal}
                          <span className="muted" style={{ marginLeft: '0.4rem' }}>
                            {formatShortDate(round.date)} · {round._count.results} result
                            {round._count.results === 1 ? '' : 's'} ·{' '}
                            {round.state === 'PUBLISHED' ? 'published' : 'draft'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
