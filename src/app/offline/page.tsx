import Link from 'next/link';

export const metadata = { title: 'Offline' };

/**
 * Offline fallback, precached by the service worker.
 *
 * Deliberately static and self-contained so it can render with no network and
 * no database. It never claims to show results — an honest "we could not reach
 * the server" is better than stale numbers presented as current.
 */
export default function OfflinePage() {
  return (
    <div className="shell pad-block">
      <div className="empty">
        <p className="empty__title">You are offline</p>
        <p className="muted" style={{ maxWidth: '46ch', marginInline: 'auto' }}>
          This page has not been saved to your device, so there is nothing to show. Anything you
          visited while online is still available.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1.25rem' }}>
          <Link href="/" className="btn btn--primary">
            Try the home page
          </Link>
          <Link href="/time-trial" className="btn btn--secondary">
            Time trial
          </Link>
        </div>
      </div>
    </div>
  );
}
