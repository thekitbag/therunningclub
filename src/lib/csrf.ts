import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getConfig } from './config';

/**
 * CSRF protection, plus the same-origin check that backs it up.
 *
 * The scheme is OWASP's HMAC-based token pattern: the token is a random nonce
 * and an issue time, signed with the application secret over the caller's
 * session. Verification recomputes the signature from the *current* session, so
 * a token is worthless to anyone who did not receive it.
 *
 * There is deliberately no CSRF cookie. A double-submit cookie would have to be
 * written while a page renders, which Next.js forbids outside server actions and
 * route handlers — and it would add nothing here, because the signature already
 * binds the token to the session and an attacker cannot read the rendered page
 * cross-origin to steal it.
 *
 * Origin checking runs in addition to the token, not instead of it, because a
 * missing `Origin` header on an older client would otherwise silently disable
 * the whole defence.
 */

export const CSRF_FIELD_NAME = '_csrf';

/** Binding used before anyone has signed in, e.g. on the sign-in form itself. */
export const ANONYMOUS_BINDING = 'anonymous';

const TOKEN_BYTES = 32;

/**
 * How long a rendered form stays submittable.
 *
 * Matches the absolute session lifetime: a form open longer than the session it
 * belongs to could not be submitted successfully anyway.
 */
export const CSRF_TOKEN_TTL_MS = 12 * 60 * 60_000;

/** Creates a token bound to a session identifier (or to anonymous sign-in). */
export function issueCsrfToken(sessionBinding: string, now = Date.now()): string {
  const nonce = randomBytes(TOKEN_BYTES).toString('base64url');
  const issuedAt = now.toString(36);
  const payload = `${nonce}.${issuedAt}`;
  return `${payload}.${sign(payload, sessionBinding)}`;
}

/**
 * Verifies a submitted token against the session it claims to belong to.
 *
 * Comparison is constant-time so a signature cannot be discovered a byte at a
 * time by measuring how long a rejection takes.
 */
export function verifyCsrfToken(
  submitted: string | undefined | null,
  sessionBinding: string,
  now = Date.now(),
): boolean {
  if (!submitted) return false;

  const parts = submitted.split('.');
  if (parts.length !== 3) return false;

  const [nonce, issuedAt, signature] = parts as [string, string, string];
  if (!nonce || !issuedAt || !signature) return false;

  const issuedAtMs = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtMs)) return false;
  // Reject anything expired, and anything claiming to come from the future by
  // more than a minute of clock skew.
  if (now - issuedAtMs > CSRF_TOKEN_TTL_MS) return false;
  if (issuedAtMs - now > 60_000) return false;

  return constantTimeEquals(signature, sign(`${nonce}.${issuedAt}`, sessionBinding));
}

function sign(payload: string, sessionBinding: string): string {
  return createHmac('sha256', getConfig().sessionSecret)
    .update(`${payload}:${sessionBinding}`)
    .digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Rejects a state-changing request whose `Origin` or `Referer` is not this site.
 *
 * A request with neither header is rejected: every browser sends `Origin` on a
 * cross-origin form post, so its absence on a mutation is not something a real
 * user journey produces.
 */
export function isSameOrigin(headers: Headers): boolean {
  const expected = getConfig().appOrigin;
  const origin = headers.get('origin');
  if (origin) return origin === expected;

  const referer = headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}
