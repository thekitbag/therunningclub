import { beforeEach, describe, expect, it } from 'vitest';
import { clearCookies, createAdmin, signInAs } from './helpers';
import {
  ANONYMOUS_BINDING,
  CSRF_FIELD_NAME,
  CSRF_TOKEN_TTL_MS,
  isSameOrigin,
  issueCsrfToken,
  verifyCsrfToken,
} from '@/lib/csrf';
import { assertRequestIntegrity, getCsrfToken, guardMutation } from '@/lib/actions';
import { ServiceError } from '@/services/errors';
import { AuthorizationError } from '@/lib/authz';

/**
 * CSRF and same-origin defences.
 *
 * `helpers.ts` mocks `next/headers` so `headers()` reports the configured
 * APP_ORIGIN — i.e. a same-origin request. These tests therefore exercise the
 * token half directly, and the origin half through `isSameOrigin`.
 */

beforeEach(() => clearCookies());

function formWith(token: string | null): FormData {
  const formData = new FormData();
  if (token !== null) formData.set(CSRF_FIELD_NAME, token);
  return formData;
}

describe('token issue and verify', () => {
  it('accepts a token verified against the session it was issued for', () => {
    const token = issueCsrfToken('session-1');
    expect(verifyCsrfToken(token, 'session-1')).toBe(true);
  });

  it('rejects a token minted for a different session', () => {
    // This is the whole point of the binding: a token stolen from, or issued
    // to, one session is worthless against another.
    const token = issueCsrfToken('session-1');
    expect(verifyCsrfToken(token, 'session-2')).toBe(false);
  });

  it('rejects an anonymous token against a signed-in session', () => {
    const token = issueCsrfToken(ANONYMOUS_BINDING);
    expect(verifyCsrfToken(token, 'session-1')).toBe(false);
  });

  it('issues a different token every time', () => {
    expect(issueCsrfToken('session-1')).not.toBe(issueCsrfToken('session-1'));
  });

  it('rejects a tampered signature, nonce or timestamp', () => {
    const token = issueCsrfToken('session-1');
    const [nonce, issuedAt, signature] = token.split('.') as [string, string, string];

    expect(verifyCsrfToken(`${nonce}.${issuedAt}.${signature.slice(0, -1)}x`, 'session-1')).toBe(
      false,
    );
    expect(verifyCsrfToken(`${nonce.slice(0, -1)}x.${issuedAt}.${signature}`, 'session-1')).toBe(
      false,
    );
    expect(verifyCsrfToken(`${nonce}.${issuedAt.slice(0, -1)}z.${signature}`, 'session-1')).toBe(
      false,
    );
  });

  it('rejects missing, empty and malformed tokens', () => {
    for (const bad of [undefined, null, '', 'no-separators', 'only.two', '..', 'a.b.c']) {
      expect(verifyCsrfToken(bad, 'session-1'), String(bad)).toBe(false);
    }
  });

  it('expires a token once it is older than the session lifetime', () => {
    const issuedAt = Date.now();
    const token = issueCsrfToken('session-1', issuedAt);

    expect(verifyCsrfToken(token, 'session-1', issuedAt + CSRF_TOKEN_TTL_MS - 1000)).toBe(true);
    expect(verifyCsrfToken(token, 'session-1', issuedAt + CSRF_TOKEN_TTL_MS + 1000)).toBe(false);
  });

  it('rejects a token claiming to come from the future', () => {
    const now = Date.now();
    // A backdated clock must not let someone mint long-lived tokens.
    const token = issueCsrfToken('session-1', now + 10 * 60_000);
    expect(verifyCsrfToken(token, 'session-1', now)).toBe(false);
  });
});

describe('same-origin checking', () => {
  const expected = process.env.APP_ORIGIN as string;

  it('accepts a matching Origin header', () => {
    expect(isSameOrigin(new Headers({ origin: expected }))).toBe(true);
  });

  it('rejects a different origin', () => {
    expect(isSameOrigin(new Headers({ origin: 'https://evil.example' }))).toBe(false);
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(isSameOrigin(new Headers({ referer: `${expected}/admin/runners` }))).toBe(true);
    expect(isSameOrigin(new Headers({ referer: 'https://evil.example/page' }))).toBe(false);
    expect(isSameOrigin(new Headers({ referer: 'not a url' }))).toBe(false);
  });

  it('rejects a request with neither header', () => {
    // Every browser sends Origin on a cross-origin form post, so its absence on
    // a mutation is not something a real user journey produces.
    expect(isSameOrigin(new Headers())).toBe(false);
  });
});

describe('request guards', () => {
  it('rejects a form with no CSRF field', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    await expect(assertRequestIntegrity(formWith(null))).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('rejects a token issued for a different session', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    const foreign = issueCsrfToken('some-other-session');
    await expect(assertRequestIntegrity(formWith(foreign))).rejects.toThrow(/form has expired/);
  });

  it('accepts a token issued for the current session', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);
    const token = await getCsrfToken();

    await expect(assertRequestIntegrity(formWith(token))).resolves.toBeUndefined();
  });

  it('invalidates a token once the session is rotated by re-authentication', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);
    const oldToken = await getCsrfToken();

    // Signing in again creates a new session, so the previous form's token no
    // longer verifies against the current binding.
    await signInAs(admin.id);
    await expect(assertRequestIntegrity(formWith(oldToken))).rejects.toThrow(/form has expired/);
  });

  it('guardMutation requires authentication as well as a valid token', async () => {
    // Anonymous callers hold a valid anonymous-bound token — the sign-in form
    // needs one — but that must not open an admin mutation.
    const anonymousToken = await getCsrfToken();
    await expect(guardMutation(formWith(anonymousToken))).rejects.toThrow(AuthorizationError);

    const admin = await createAdmin();
    await signInAs(admin.id);
    const signedInToken = await getCsrfToken();
    await expect(guardMutation(formWith(signedInToken))).resolves.toMatchObject({ id: admin.id });
  });

  it('surfaces a ServiceError the form layer can render', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    try {
      await assertRequestIntegrity(formWith('bogus.token.here'));
      expect.unreachable('expected a ServiceError');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe('FORBIDDEN');
      // The message is written for a volunteer, not a developer.
      expect((error as ServiceError).message).toMatch(/Reload the page/);
    }
  });

  it('issuing a token writes no cookie, so it is safe during render', async () => {
    // Regression guard: writing a cookie here throws in Next.js outside a
    // server action, which took down the whole sign-in page.
    const admin = await createAdmin();
    await signInAs(admin.id);

    const before = await getCsrfToken();
    const after = await getCsrfToken();
    expect(before).not.toBe(after);
    // Both still verify: the token is stateless, not stored anywhere.
    await expect(assertRequestIntegrity(formWith(before))).resolves.toBeUndefined();
    await expect(assertRequestIntegrity(formWith(after))).resolves.toBeUndefined();
  });
});
