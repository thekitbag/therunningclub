import Link from 'next/link';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { CsrfField } from '@/components/admin/CsrfField';
import { ChampionshipStateForm } from './ChampionshipStateForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Championships' };

export default async function ChampionshipsAdminPage() {
  await requireActorOrRedirect('/admin/championships');

  const championships = await prisma.championship.findMany({
    orderBy: { year: 'desc' },
    include: {
      races: {
        where: { isChampionshipQualifier: true },
        select: { id: true, name: true, _count: { select: { championshipResults: true } } },
      },
    },
  });

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Championships</h1>
        <p className="muted">
          A championship is created automatically when you mark the year&rsquo;s first qualifying
          race. Club placings are entered on each race&rsquo;s own page.
        </p>
      </header>

      <ChampionshipStateForm
        csrfField={<CsrfField />}
        championships={championships.map((championship) => ({
          id: championship.id,
          year: championship.year,
          state: championship.state,
        }))}
      />

      <section aria-labelledby="all-championships">
        <div className="section-head">
          <h2 id="all-championships">Championships</h2>
        </div>
        {championships.length === 0 ? (
          <p className="muted">
            None yet. <Link href="/admin/races">Mark a race as a qualifier</Link> to create one.
          </p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {championships.map((championship) => {
              const withResults = championship.races.filter(
                (race) => race._count.championshipResults > 0,
              ).length;
              return (
                <li key={championship.id} className="card">
                  <div className="split">
                    <div>
                      <h3 style={{ fontSize: '1.0625rem' }}>
                        <Link href={`/admin/championships/${championship.id}`}>
                          {championship.name}
                        </Link>
                      </h3>
                      <p className="muted">
                        {championship.races.length} qualifying race
                        {championship.races.length === 1 ? '' : 's'} · {withResults} with placings
                        entered
                      </p>
                    </div>
                    <span
                      className={`tag${championship.state === 'PUBLISHED' ? ' tag--green' : ''}`}
                    >
                      {championship.state === 'PUBLISHED'
                        ? '✓ Published'
                        : titleCase(championship.state)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
