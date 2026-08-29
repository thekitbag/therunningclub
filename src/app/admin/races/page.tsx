import Link from 'next/link';
import { requireActorOrRedirect } from '@/lib/authz';
import { formatShortDate } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { listRacesForAdmin } from '@/services/races';
import { RaceCreateForm, RaceStateForm } from './RaceForms';
import { ScrollableTable } from '@/components/ScrollableTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Races' };

export default async function RacesAdminPage() {
  await requireActorOrRedirect('/admin/races');
  const races = await listRacesForAdmin();

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Races</h1>
        <p className="muted">
          Marking a race as a championship qualifier creates that calendar year&rsquo;s championship
          automatically if it does not exist yet.
        </p>
      </header>

      <RaceCreateForm csrfField={<CsrfField />} />

      <RaceStateForm
        csrfField={<CsrfField />}
        races={races.map((race) => ({
          id: race.id,
          name: race.name,
          state: race.state,
        }))}
      />

      <section aria-labelledby="all-races">
        <div className="section-head">
          <h2 id="all-races">All races</h2>
          <p className="muted">{races.length} race(s)</p>
        </div>
        {races.length === 0 ? (
          <p className="muted">No races yet. Add the first one above.</p>
        ) : (
          <ScrollableTable label="All races">
            <table>
              <caption>
                Every race, newest first. Open one to edit it or enter club placings.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Race</th>
                  <th scope="col">Label</th>
                  <th scope="col">Date</th>
                  <th scope="col">Qualifier</th>
                  <th scope="col" className="num">
                    Placings
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {races.map((race) => (
                  <tr key={race.id}>
                    <th scope="row">{race.name}</th>
                    <td>
                      <code>{race.shortLabel}</code>
                    </td>
                    <td className="nowrap">{formatShortDate(race.date)}</td>
                    <td>
                      {race.isChampionshipQualifier ? (
                        <span className="tag tag--purple">
                          ★ {race.championship?.year ?? 'yes'}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{race._count.championshipResults}</td>
                    <td>{titleCase(race.status)}</td>
                    <td>
                      <span className={`tag${race.state === 'PUBLISHED' ? ' tag--green' : ''}`}>
                        {race.state === 'PUBLISHED' ? '✓ Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <Link className="btn btn--secondary btn--sm" href={`/admin/races/${race.id}`}>
                        Open
                        <span className="visually-hidden"> {race.name}</span>
                      </Link>
                    </td>
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
