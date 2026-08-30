import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The CSP is deliberately strict: the application ships no third-party scripts
 * and inlines no scripts of its own beyond the Next.js runtime, which is served
 * from the same origin. `connect-src` stays same-origin because the app never
 * calls an external API at runtime (age-grade standards are vendored).
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /*
   * The club's results are members' names and performance data, kept behind the
   * club passcode and deliberately out of search results.
   *
   * `robots.txt` asks a crawler not to *fetch* a page; this tells it not to
   * *index* what it may already have fetched, which is the one that matters for
   * anything crawled before the gate existed. It is set here rather than in
   * middleware because middleware response headers do not reach the client in
   * this version of Next.
   */
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root; without it Turbopack can pick up an unrelated
  // lockfile from a parent directory outside this repository.
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  outputFileTracingIncludes: {
    '/**': ['./prisma/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // The service worker must never be cached by an intermediary, or a
        // stale worker can pin users to an old cache policy.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Defence in depth: even if a cache ignored the response headers set in
        // route handlers, admin responses are declared private here too.
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        // Public results pages are rendered per request so they always reflect
        // the latest publication, but they hold nothing private. Marking them
        // `public` with `must-revalidate` is what lets the service worker keep
        // a last-known copy for the offline view while never serving it without
        // first trying the network.
        source: '/',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/(time-trial|club-championship|races|privacy|offline)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/(time-trial|club-championship|races)/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
