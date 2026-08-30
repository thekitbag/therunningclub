import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { formatShortDate } from '@/lib/dates';
import { computeChampionshipScoring, previewChampionshipImpact } from '@/services/championships';
import { eligibilityLabel } from '@/domain/scoring';
import { ScrollableTable } from '@/components/ScrollableTable';
import { CHAMPIONSHIP_COUNTING_RACES } from '@/domain/scoring/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ championshipId: string }>;
}) {
  const { championshipId } = await params;
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    select: { name: true },
  });
  return { title: championship?.name ?? 'Championship' };
}

/**
 * Championship preview.
 *
 * Shows the table as it would be with every draft race included, plus a diff
 * against what the public currently sees, so an administrator can check the
 * effect of entering a race's placings before publishing it.
 */
export default async function ChampionshipDetailPage({
  params,
}: {
  params: Promise<{ championshipId: string }>;
}) {
  await requireActorOrRedirect('/admin/championships');
  const { championshipId } = await params;

  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: {
      races: {
        where: { isChampionshipQualifier: true },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          name: true,
          shortLabel: true,
          date: true,
          state: true,
          _count: { select: { championshipResults: true } },
        },
      },
    },
  });
  if (!championship) notFound();

  const [scoring, impact] = await Promise.all([
    computeChampionshipScoring(championshipId, { publishedOnly: false }),
    previewChampionshipImpact(championshipId),
  ]);

  const runnerIds = [
    ...scoring.standings.MALE.map((standing) => standing.runnerId),
    ...scoring.standings.FEMALE.map((standing) => standing.runnerId),
  ];
  const runners = await prisma.runner.findMany({
    where: { id: { in: runnerIds } },
    select: { id: true, givenName: true, familyName: true },
  });
  const names = new Map(runners.map((r) => [r.id, `${r.givenName} ${r.familyName}`]));

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">
          <Link href="/admin/championships">Championships</Link>
        </p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>{championship.name}</h1>
        <p className="muted">
          {championship.state === 'PUBLISHED' ? 'Published' : 'Draft — not visible to the public'}
        </p>
      </header>

      <section aria-labelledby="qualifiers-heading">
        <div className="section-head">
          <h2 id="qualifiers-heading">Qualifying races</h2>
        </div>
        {championship.races.length === 0 ? (
          <p className="muted">
            No qualifying races yet. <Link href="/admin/races">Mark a race as a qualifier</Link>.
          </p>
        ) : (
          <ScrollableTable label="Qualifying races">
            <table>
              <caption>Races counting towards this championship.</caption>
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col">Race</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">
                    Placings
                  </th>
                  <th scope="col">Visibility</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {championship.races.map((race) => (
                  <tr key={race.id}>
                    <th scope="row">
                      <code>{race.shortLabel}</code>
                    </th>
                    <td>{race.name}</td>
                    <td className="nowrap">{formatShortDate(race.date)}</td>
                    <td className="num">{race._count.championshipResults}</td>
                    <td>
                      <span className={`tag${race.state === 'PUBLISHED' ? ' tag--green' : ''}`}>
                        {race.state === 'PUBLISHED' ? '✓ Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <Link className="btn btn--secondary btn--sm" href={`/admin/races/${race.id}`}>
                        Enter placings
                        <span className="visually-hidden"> for {race.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>

      {impact.changedRunners.length > 0 ? (
        <section aria-labelledby="impact-heading">
          <div className="section-head">
            <h2 id="impact-heading">Not yet public</h2>
          </div>
          <div className="notice notice--warn">
            <p className="notice__title">
              {impact.changedRunners.length} runner(s) would change when everything is published
            </p>
            <ScrollableTable label="Championship impact">
              <table className="preview-table">
                <caption>Difference between the public table and the current draft data.</caption>
                <thead>
                  <tr>
                    <th scope="col">Runner</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="num">
                      Public total
                    </th>
                    <th scope="col" className="num">
                      Draft total
                    </th>
                    <th scope="col">Eligibility</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.changedRunners.map((change, index) => (
                    <tr key={index}>
                      <th scope="row">{change.runnerName}</th>
                      <td>{change.category === 'MALE' ? 'Male' : 'Female'}</td>
                      <td className="num">{change.fromTotal ?? '—'}</td>
                      <td className="num">{change.toTotal ?? '—'}</td>
                      <td>
                        {change.fromEligible === change.toEligible
                          ? 'Unchanged'
                          : change.toEligible
                            ? 'Becomes eligible'
                            : 'Loses eligibility'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </div>
        </section>
      ) : null}

      {(['MALE', 'FEMALE'] as const).map((category) => (
        <section key={category} aria-labelledby={`standings-${category}`}>
          <div className="section-head">
            <h3 id={`standings-${category}`}>
              {category === 'MALE' ? 'Men' : 'Women'} — draft standings
            </h3>
          </div>
          {scoring.standings[category].length === 0 ? (
            <p className="muted">No placings recorded in this category yet.</p>
          ) : (
            <ScrollableTable label="Championship tables">
              <table className="preview-table">
                <caption>Includes draft races, so this may differ from the public table.</caption>
                <thead>
                  <tr>
                    <th scope="col">Pos</th>
                    <th scope="col">Runner</th>
                    <th scope="col" className="num">
                      Races
                    </th>
                    <th scope="col" className="num">
                      Best {CHAMPIONSHIP_COUNTING_RACES}
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scoring.standings[category].map((standing) => (
                    <tr key={standing.runnerId}>
                      <td className="num">{standing.position ?? '—'}</td>
                      <th scope="row">{names.get(standing.runnerId) ?? 'Unknown runner'}</th>
                      <td className="num">{standing.racesCompleted}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {standing.countingTotal ?? '—'}
                      </td>
                      <td>{eligibilityLabel(standing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </section>
      ))}
    </div>
  );
}
