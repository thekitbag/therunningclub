import type { Metadata, Viewport } from 'next';
import { Archivo, Public_Sans } from 'next/font/google';
import { DonateButton } from '@/components/DonateButton';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { StaleBanner } from '@/components/StaleBanner';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { getConfig } from '@/lib/config';
import './globals.css';

/*
 * Fonts are self-hosted by Next at build time, so the running application makes
 * no request to an external font host. That keeps the Content-Security-Policy
 * tight and means the PWA renders identically offline.
 *
 * Archivo is a wide, signage-like grotesque for headings — the club's identity
 * is a carved stone island, and this is the closest thing to engraved lettering
 * that still sets well at small sizes. Public Sans carries the body text and,
 * more importantly, the results tables: it has genuinely good tabular figures,
 * which is what a page full of times and points needs.
 */
const display = Archivo({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});

export function generateMetadata(): Metadata {
  const { appOrigin } = getConfig();
  return {
    metadataBase: new URL(appOrigin),
    title: {
      default: 'Royal Manor of Portland Athletic Club',
      template: '%s · RMPAC',
    },
    description:
      'Time-trial results, club championship standings and race information for Royal Manor of Portland Athletic Club.',
    applicationName: 'RMPAC',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'RMPAC',
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    },
    openGraph: {
      type: 'website',
      siteName: 'Royal Manor of Portland Athletic Club',
      locale: 'en_GB',
    },
    // The club's results are members' names and performance data, kept behind
    // the club passcode and deliberately out of search results.
    robots: { index: false, follow: false, nocache: true },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#00551f' },
    { media: '(prefers-color-scheme: dark)', color: '#101215' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SiteHeader />
        <StaleBanner />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
        <DonateButton />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
