import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell pad-block">
      <div className="empty">
        <p className="empty__title">Page not found</p>
        <p className="muted">
          That page does not exist, or the season or championship it referred to has not been
          published.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <Link href="/" className="btn btn--primary">
            Back to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}
