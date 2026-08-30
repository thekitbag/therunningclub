import { describe, expect, it } from 'vitest';
import {
  ACCESS_TTL_MS,
  isAlwaysAllowed,
  issueAccessToken,
  passcodeMatches,
  verifyAccessToken,
} from '../site-access';

const PASSCODE = 'portland2026';
const SECRET = 'a-test-session-secret-well-over-thirty-two-characters';

describe('passcodeMatches', () => {
  it('accepts the configured passcode', () => {
    expect(passcodeMatches('portland2026', PASSCODE)).toBe(true);
  });

  it('tolerates surrounding whitespace, because people paste', () => {
    expect(passcodeMatches('  portland2026 ', PASSCODE)).toBe(true);
    expect(passcodeMatches('portland2026\n', PASSCODE)).toBe(true);
  });

  it('is case sensitive and rejects anything else', () => {
    for (const wrong of ['Portland2026', 'portland2025', 'portland', '', 'portland20266']) {
      expect(passcodeMatches(wrong, PASSCODE), wrong).toBe(false);
    }
  });
});

describe('access tokens', () => {
  it('round-trips a token it issued', async () => {
    const token = await issueAccessToken(PASSCODE, SECRET);
    await expect(verifyAccessToken(token, PASSCODE, SECRET)).resolves.toBe(true);
  });

  it('rejects a token once the passcode is rotated', async () => {
    // This is what makes rotation meaningful: changing the passcode must lock
    // out every device that was already unlocked.
    const token = await issueAccessToken(PASSCODE, SECRET);
    await expect(verifyAccessToken(token, 'a-new-passcode', SECRET)).resolves.toBe(false);
  });

  it('rejects a token once the session secret is rotated', async () => {
    const token = await issueAccessToken(PASSCODE, SECRET);
    await expect(verifyAccessToken(token, PASSCODE, 'a-different-secret-entirely')).resolves.toBe(
      false,
    );
  });

  it('rejects a forged or tampered token', async () => {
    const token = await issueAccessToken(PASSCODE, SECRET);
    const [issuedAt, signature] = token.split('.') as [string, string];

    for (const bad of [
      `${issuedAt}.${signature.slice(0, -1)}x`,
      `${issuedAt}x.${signature}`,
      `${issuedAt}.`,
      'no-separator',
      '',
    ]) {
      await expect(verifyAccessToken(bad, PASSCODE, SECRET), bad).resolves.toBe(false);
    }
    await expect(verifyAccessToken(undefined, PASSCODE, SECRET)).resolves.toBe(false);
  });

  it('expires after the access lifetime', async () => {
    const issuedAt = Date.now();
    const token = await issueAccessToken(PASSCODE, SECRET, issuedAt);

    await expect(
      verifyAccessToken(token, PASSCODE, SECRET, issuedAt + ACCESS_TTL_MS - 60_000),
    ).resolves.toBe(true);
    await expect(
      verifyAccessToken(token, PASSCODE, SECRET, issuedAt + ACCESS_TTL_MS + 60_000),
    ).resolves.toBe(false);
  });

  it('rejects a token claiming to come from the future', async () => {
    const now = Date.now();
    const token = await issueAccessToken(PASSCODE, SECRET, now + 10 * 60_000);
    await expect(verifyAccessToken(token, PASSCODE, SECRET, now)).resolves.toBe(false);
  });
});

describe('isAlwaysAllowed', () => {
  it('lets through the few paths the gate cannot block', () => {
    for (const path of [
      '/unlock',
      '/api/health',
      '/api/ping',
      '/manifest.webmanifest',
      '/sw.js',
      '/robots.txt',
      '/favicon.ico',
      '/rmpac-logo.png',
      '/icons/icon-192.png',
      '/_next/static/chunk.js',
    ]) {
      expect(isAlwaysAllowed(path), path).toBe(true);
    }
  });

  it('lets administration through to its own, stronger authentication', () => {
    expect(isAlwaysAllowed('/admin')).toBe(true);
    expect(isAlwaysAllowed('/admin/sign-in')).toBe(true);
    expect(isAlwaysAllowed('/admin/runners')).toBe(true);
  });

  it('blocks everything that shows club results', () => {
    for (const path of [
      '/',
      '/time-trial',
      '/time-trial/summer-2026',
      '/time-trial/summer-2026/rounds/abc',
      '/club-championship',
      '/club-championship/2026',
      '/races',
      '/privacy',
      '/offline',
    ]) {
      expect(isAlwaysAllowed(path), path).toBe(false);
    }
  });

  it('is not fooled by a path that merely starts with an allowed word', () => {
    // A prefix match on "/admin" must not accidentally open "/administrators"
    // style public routes; there are none today, but the rule should hold.
    expect(isAlwaysAllowed('/unlocked-results')).toBe(false);
    expect(isAlwaysAllowed('/api/public/results')).toBe(false);
  });
});
