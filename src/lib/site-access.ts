/**
 * The club passcode that gates the whole public site.
 *
 * WHY A SHARED PASSCODE RATHER THAN ACCOUNTS
 * ------------------------------------------
 * The goal is to keep members' names and times off the open internet — not to
 * control who among the club sees what. A shared passcode meets that goal and
 * collects no personal data from runners at all, whereas individual accounts
 * would mean storing an email address for every member: more personal data to
 * protect, not less, in service of a privacy requirement.
 *
 * It follows that this is a *modest* control. It keeps out search engines and
 * passers-by. It does not stop a member sharing the passcode, and it is not
 * meant to. Administrator access, which can change published results, uses real
 * individual accounts and is a separate and much stronger mechanism.
 *
 * WHY WEB CRYPTO
 * --------------
 * This module runs in Next.js middleware as well as in server actions.
 * Middleware may execute on the Edge runtime, where `node:crypto` does not
 * exist, so everything here uses the Web Crypto API, which is present in both.
 */

/** Cookie holding proof that the passcode was entered on this device. */
export const ACCESS_COOKIE_NAME = 'rmpac_access';

/**
 * How long a device stays unlocked.
 *
 * Long on purpose: a member should enter the passcode roughly once a season,
 * not every visit. Shortening it would push people towards writing the passcode
 * down somewhere less safe than their own browser.
 */
export const ACCESS_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return toBase64Url(signature);
}

/**
 * Compares two strings without leaking their difference through timing.
 *
 * The lengths are compared first and separately: length is not secret, and
 * padding to a common length would be more code for no benefit.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Checks a submitted passcode against the configured one.
 *
 * Comparison is constant-time so the passcode cannot be recovered a character
 * at a time by measuring how long a rejection takes. Whitespace is trimmed
 * because people paste, and a trailing space is not a different passcode as far
 * as anyone entering it is concerned.
 */
export function passcodeMatches(submitted: string, configured: string): boolean {
  return constantTimeEquals(submitted.trim(), configured.trim());
}

/**
 * Issues the cookie value proving this device knows the passcode.
 *
 * The value is an issue timestamp plus an HMAC over it, keyed on the passcode
 * *and* the session secret. Keying on the passcode is what makes rotation
 * meaningful: change the passcode and every previously issued cookie stops
 * verifying, so everyone is locked out and must enter the new one.
 */
export async function issueAccessToken(
  passcode: string,
  sessionSecret: string,
  now = Date.now(),
): Promise<string> {
  const issuedAt = now.toString(36);
  return `${issuedAt}.${await sign(issuedAt, `${sessionSecret}:${passcode}`)}`;
}

/** Verifies an access cookie. Returns false for anything malformed or expired. */
export async function verifyAccessToken(
  token: string | undefined | null,
  passcode: string,
  sessionSecret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const issuedAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!issuedAt || !signature) return false;

  const issuedAtMs = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (now - issuedAtMs > ACCESS_TTL_MS) return false;
  // A cookie claiming to come from the future is either a clock problem or a
  // forgery attempt; either way it is not something to honour.
  if (issuedAtMs - now > 60_000) return false;

  return constantTimeEquals(signature, await sign(issuedAt, `${sessionSecret}:${passcode}`));
}

/**
 * Paths that must stay reachable while the site is locked.
 *
 * Kept deliberately short, and each entry has a reason:
 *   - the unlock page itself, or nobody could ever get in;
 *   - `/api/health`, because Render's health check is unauthenticated and the
 *     response contains no club data;
 *   - `/api/ping`, the reachability probe behind the offline banner;
 *   - build assets and PWA files, without which the unlock page cannot render;
 *   - `/admin`, which has its own and much stronger authentication.
 */
export const UNLOCK_PATH = '/unlock';

const ALWAYS_ALLOWED = [
  UNLOCK_PATH,
  '/api/health',
  '/api/ping',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  '/rmpac-logo.png',
  '/robots.txt',
];

const ALLOWED_PREFIXES = ['/_next/', '/icons/', '/admin'];

export function isAlwaysAllowed(pathname: string): boolean {
  if (ALWAYS_ALLOWED.includes(pathname)) return true;
  return ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
