import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell stack">
        <p>
          Royal Manor of Portland Athletic Club. Results and race information are published by club
          volunteers.
        </p>
        <p>
          Runner names and competition results on this site are public. Dates of birth are held
          privately and used only to calculate age-grade percentages — they are never published.{' '}
          <Link href="/privacy">Read the privacy notice</Link>.
        </p>
        <p>
          <Link href="/admin">Club administration</Link>
        </p>
      </div>
    </footer>
  );
}
