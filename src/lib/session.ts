import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { getConfig } from './config';
import type { Administrator } from '@/generated/prisma';

/**
 * Opaque database-backed sessions.
 *
 * The cookie holds a high-entropy random token; the database holds only its
 * SHA-256. A read-only disclosure of the session table therefore yields nothing
 * replayable. SHA-256 is appropriate here — unlike a password, the token has
 * full entropy, so there is nothing to brute-force and no need for a slow KDF.
 */

export const SESSION_COOKIE_NAME = 'rmpac_session';

const TOKEN_BYTES = 32;

/** Absolute lifetime. A session cannot outlive this even if used constantly. */
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;

/** Idle lifetime. A session unused for this long is treated as expired. */
export const SESSION_IDLE_MS = 2 * 60 * 60_000;

export interface AdminActor {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly sessionId: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

/** Issues a session. The raw token is returned once and never stored. */
export async function createSession(
  administratorId: string,
  clientSummary?: string,
): Promise<CreatedSession> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);

  const session = await prisma.adminSession.create({
    data: {
      administratorId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      clientSummary: clientSummary?.slice(0, 120),
    },
    select: { id: true },
  });

  return { token, sessionId: session.id, expiresAt };
}

export interface ResolvedSession {
  readonly actor: AdminActor;
  readonly administrator: Administrator;
}

/**
 * Resolves a raw token to an active administrator, or null.
 *
 * Every condition that should deny access is checked here in one place: the
 * session must exist, be unrevoked, be inside both its absolute and idle
 * windows, and belong to an administrator who is still `ACTIVE`. That last
 * check is what makes disabling an account revoke it immediately, without
 * needing to find and delete their sessions first.
 */
export async function resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { administrator: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (session.administrator.status !== 'ACTIVE') return null;

  // Touch at most once a minute: an update on every request would write far
  // more than the idle check needs.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    actor: {
      id: session.administrator.id,
      email: session.administrator.email,
      displayName: session.administrator.displayName,
      sessionId: session.id,
    },
    administrator: session.administrator,
  };
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Revokes every session for an administrator. Used on disable and on reset. */
export async function revokeAllSessionsFor(
  administratorId: string,
  reason: string,
): Promise<number> {
  const result = await prisma.adminSession.updateMany({
    where: { administratorId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: getConfig().isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: getConfig().isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/** The signed-in administrator, or null. Safe to call from any server context. */
export async function getCurrentActor(): Promise<AdminActor | null> {
  const resolved = await resolveSession(await readSessionToken());
  return resolved?.actor ?? null;
}
