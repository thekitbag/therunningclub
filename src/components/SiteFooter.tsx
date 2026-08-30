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
          This site is for club members and is kept out of search engines. Runner names and results
          are visible to anyone with the club passcode. Dates of birth are held privately and used
          only to calculate age-grade percentages — they are never shown.{' '}
          <Link href="/privacy">Read the privacy notice</Link>.
        </p>
        <p>
          <Link href="/admin">Club administration</Link>
        </p>
      </div>
    </footer>
  );
}
