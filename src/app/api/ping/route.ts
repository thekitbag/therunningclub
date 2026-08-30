/**
 * Reachability probe.
 *
 * Deliberately the cheapest possible endpoint: no database, no configuration,
 * no body. The public pages call it to decide whether they are showing live or
 * cached data, and it must never be cached itself — the service worker bypasses
 * everything under `/api/`, so a failure here genuinely means the server could
 * not be reached.
 */

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
