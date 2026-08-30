import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  UNLOCK_PATH,
  isAlwaysAllowed,
  verifyAccessToken,
} from '@/lib/site-access';

/**
 * Enforces the club passcode across the whole site.
 *
 * This lives in middleware rather than in a layout or in each page for one
 * reason: middleware runs before *every* matched request, so a route added
 * later is gated by default. A per-page check is a control you can forget to
 * apply, and forgetting it here would publish members' names and times.
 *
 * Middleware may run on the Edge runtime, so the configuration is read straight
 * from `process.env` rather than through `getConfig()`, which pulls in Node-only
 * modules. The values are read-only here and validated properly at startup by
 * `src/instrumentation.ts`.
 *
 * The `noindex` header is set in `next.config.ts`, not here: response headers
 * set in middleware do not reach the client in this version of Next.
 */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const passcode = process.env.SITE_PASSCODE?.trim() ?? '';
  const sessionSecret = process.env.SESSION_SECRET ?? '';

  // No passcode configured means no gate. Production cannot reach this state:
  // the startup check refuses to boot without one.
  if (!passcode || !sessionSecret) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isAlwaysAllowed(pathname)) return NextResponse.next();

  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (await verifyAccessToken(token, passcode, sessionSecret)) {
    return NextResponse.next();
  }

  // Send them to the unlock page, remembering where they were headed so they
  // land on the page they actually wanted rather than the home page.
  const unlock = new URL(UNLOCK_PATH, request.url);
  const target = `${pathname}${search}`;
  if (target !== '/' && !target.startsWith(UNLOCK_PATH)) {
    unlock.searchParams.set('next', target);
  }

  const response = NextResponse.redirect(unlock);
  // A stale access cookie is cleared on the way past, so a rotated passcode
  // does not leave every member carrying a cookie that can never verify.
  if (token) response.cookies.delete(ACCESS_COOKIE_NAME);
  return response;
}

export const config = {
  /*
   * Everything except Next's build output and image optimiser. The allow-list
   * for genuinely public paths lives in `isAlwaysAllowed`, in one place, rather
   * than being split between here and there.
   */
  matcher: ['/((?!_next/static|_next/image).*)'],
};
