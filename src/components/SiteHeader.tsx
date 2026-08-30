'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Public navigation.
 *
 * All four sections stay visible as a scrollable rail on a phone rather than
 * collapsing behind a menu button, which is what keeps the "current standings
 * in two taps" acceptance criterion true from any page.
 */

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/time-trial', label: 'Time Trial' },
  { href: '/club-championship', label: 'Club Championship' },
  { href: '/races', label: 'Races' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  const isCurrent = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="site-header">
      <div className="shell site-header__bar">
        <Link href="/" className="brand">
          <Image
            className="brand__mark"
            src="/rmpac-logo.png"
            alt=""
            width={92}
            height={92}
            priority
          />
          <span className="brand__text">
            <span className="brand__name">Royal Manor of Portland</span>
            <span className="brand__sub">Athletic Club</span>
          </span>
        </Link>
      </div>
      <nav className="site-nav shell" aria-label="Main">
        <ul className="site-nav__list">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="site-nav__link"
                aria-current={isCurrent(link.href) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
