import Image from 'next/image';
import { redirect } from 'next/navigation';
import { UnlockForm } from './UnlockForm';
import { ClearCachedPages } from '@/components/ClearCachedPages';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Club passcode',
  robots: { index: false, follow: false },
};

/**
 * The one page reachable while the site is locked.
 *
 * It deliberately shows nothing about the club beyond its name and the reason
 * for the gate — no runner names, no results, no fixtures. Whatever is on this
 * page is, by definition, public.
 */
export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const config = getConfig();
  if (!config.siteIsGated) redirect('/');

  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="shell pad-block" style={{ maxWidth: '28rem', marginInline: 'auto' }}>
      <ClearCachedPages />
      <div className="stack-lg">
        <header className="stack" style={{ gap: '0.75rem', textAlign: 'center' }}>
          <Image
            src="/rmpac-logo.png"
            alt=""
            width={92}
            height={92}
            priority
            style={{ marginInline: 'auto', borderRadius: '50%' }}
          />
          <h1 style={{ fontSize: '1.5rem', textTransform: 'uppercase' }}>
            Royal Manor of Portland Athletic Club
          </h1>
          <p className="muted">
            Results are for club members. Enter the club passcode to see race information,
            time-trial standings and the club championship.
          </p>
        </header>

        <UnlockForm next={safeNext} />

        <p className="muted" style={{ textAlign: 'center' }}>
          This site is kept off search engines so members&rsquo; names and times are not findable by
          strangers. Ask a committee member if you need the passcode.
        </p>
      </div>
    </div>
  );
}
