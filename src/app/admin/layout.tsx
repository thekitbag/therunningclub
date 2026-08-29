import Link from 'next/link';
import { getCurrentActor } from '@/lib/session';
import { signOutAction } from './actions';
import { CsrfField } from '@/components/admin/CsrfField';
import './admin.css';

/**
 * Admin shell.
 *
 * Desktop-first, per the product specification: this is where volunteers do
 * bulk data entry, and a wide two-column layout with a persistent section nav
 * suits that far better than the phone-first public pages.
 *
 * The sign-in page renders inside this layout too but without the navigation,
 * because there is no actor to navigate as.
 */
export const metadata = {
  title: { default: 'Administration', template: '%s · RMPAC admin' },
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/runners', label: 'Runners' },
  { href: '/admin/time-trials', label: 'Time trials' },
  { href: '/admin/races', label: 'Races' },
  { href: '/admin/championships', label: 'Championships' },
  { href: '/admin/administrators', label: 'Administrators' },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();

  return (
    <div className="admin">
      {actor ? (
        <div className="admin__bar">
          <div className="shell split">
            <nav aria-label="Administration">
              <ul className="admin__nav">
                {SECTIONS.map((section) => (
                  <li key={section.href}>
                    <Link href={section.href} className="admin__nav-link">
                      {section.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="btn-row">
              <span className="muted">
                Signed in as <strong>{actor.displayName}</strong>
              </span>
              <form action={signOutAction}>
                <CsrfField />
                <button type="submit" className="btn btn--secondary btn--sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <div className="shell pad-block">{children}</div>
    </div>
  );
}
