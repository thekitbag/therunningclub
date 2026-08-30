import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { findCurrentSeasonSlug } from '@/services/public-queries';

/**
 * `/time-trial` always resolves to the current season, so the section defaults
 * to live information rather than an archive index.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Time Trial' };

export default async function TimeTrialIndexPage() {
  const slug = await findCurrentSeasonSlug();
  if (slug) redirect(`/time-trial/${slug}`);

  return (
    <div className="shell pad-block">
      <div className="section-head">
        <h1>Time trial</h1>
      </div>
      <EmptyState title="No time-trial season published yet">
        <p>
          The club runs two six-round seasons a year — winter from October to March, and summer from
          April to September. Results appear here once the first round is published.
        </p>
      </EmptyState>
    </div>
  );
}
