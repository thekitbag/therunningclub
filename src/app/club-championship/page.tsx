import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { listPublishedChampionshipYears } from '@/services/public-queries';
import { CHAMPIONSHIP_COUNTING_RACES, CHAMPIONSHIP_QUALIFYING_RACES } from '@/domain/scoring/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Club Championship' };

/** Defaults to the most recent published championship year. */
export default async function ChampionshipIndexPage() {
  const years = await listPublishedChampionshipYears();
  if (years.length > 0) redirect(`/club-championship/${years[0]}`);

  return (
    <div className="shell pad-block">
      <div className="section-head">
        <h1>Club championship</h1>
      </div>
      <EmptyState title="No championship published yet">
        <p>
          The club championship runs over a calendar year. Members need{' '}
          {CHAMPIONSHIP_QUALIFYING_RACES} qualifying races before they enter the standings, and the{' '}
          {CHAMPIONSHIP_COUNTING_RACES} lowest scores count towards the total.
        </p>
      </EmptyState>
    </div>
  );
}
