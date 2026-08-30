import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import { logger } from '@/lib/logger';
import {
  hashPassword,
  needsRehash,
  storedParametersToJson,
  validatePasswordStrength,
  verifyPassword,
} from '@/lib/password';
import { createSession, revokeAllSessionsFor, revokeSession, type AdminActor } from '@/lib/session';
import { SIGN_IN_RULE, consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { ServiceError, conflict, fieldErrorsFrom, notFound, validation } from './errors';

/**
 * Administrator accounts, sign-in and recovery.
 *
 * There is no public registration and no self-service password reset by email.
 * An active administrator issues a one-time reset link to a colleague through
 * an out-of-band channel; if every account is locked out, the bootstrap command
 * documented in the README is the recovery path.
 */

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').max(320),
  password: z.string().min(1, 'Enter your password.'),
});

export const administratorInputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(320),
  displayName: z.string().trim().min(1, 'Required.').max(120),
  password: z.string().min(1, 'Required.'),
});

/**
 * Generic message for every failed sign-in.
 *
 * Never says whether the address exists, whether the account is disabled, or
 * whether only the password was wrong — all three would let an unauthenticated
 * visitor enumerate the club's administrators.
 */
const SIGN_IN_FAILURE = 'Those sign-in details were not recognised.';

export interface SignInSuccess {
  readonly token: string;
  readonly expiresAt: Date;
  readonly actor: Pick<AdminActor, 'id' | 'email' | 'displayName'>;
}

export async function signIn(
  input: { email: string; password: string },
  context?: { rateLimitKey?: string; clientSummary?: string },
): Promise<SignInSuccess> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    throw validation(SIGN_IN_FAILURE, fieldErrorsFrom(parsed.error));
  }

  const email = normaliseEmail(parsed.data.email);
  const rateLimitKey = `sign-in:${context?.rateLimitKey ?? email}`;
  const limit = consumeRateLimit(rateLimitKey, SIGN_IN_RULE);
  if (!limit.allowed) {
    throw new ServiceError(
      'RATE_LIMITED',
      `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
    );
  }

  const administrator = await prisma.administrator.findUnique({ where: { email } });

  // Verify against a dummy hash when the account is missing so that a
  // non-existent address costs the same time as a wrong password.
  const stored = administrator
    ? { hash: administrator.passwordHash, parameters: administrator.passwordParameters }
    : { hash: '', parameters: null };
  const passwordMatches = await verifyPassword(parsed.data.password, stored);

  if (!administrator || !passwordMatches || administrator.status !== 'ACTIVE') {
    logger.warn('Failed administrator sign-in', { emailDomain: email.split('@')[1] });
    throw validation(SIGN_IN_FAILURE);
  }

  resetRateLimit(rateLimitKey);

  // Raise the cost of an old hash transparently, now that the plaintext is
  // available and already verified.
  if (needsRehash({ parameters: administrator.passwordParameters })) {
    const rehashed = await hashPassword(parsed.data.password);
    await prisma.administrator.update({
      where: { id: administrator.id },
      data: {
        passwordHash: rehashed.hash,
        passwordParameters: storedParametersToJson(rehashed.parameters),
        passwordUpdatedAt: new Date(),
      },
    });
  }

  const session = await createSession(administrator.id, context?.clientSummary);

  await prisma.administrator.update({
    where: { id: administrator.id },
    data: { lastSignedInAt: new Date() },
  });

  await recordAuditEvent({
    actorId: administrator.id,
    action: 'admin.signed_in',
    entityType: 'Administrator',
    entityId: administrator.id,
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    actor: {
      id: administrator.id,
      email: administrator.email,
      displayName: administrator.displayName,
    },
  };
}

export async function signOut(actor: AdminActor): Promise<void> {
  await revokeSession(actor.sessionId, 'signed out');
  await recordAuditEvent({
    actorId: actor.id,
    action: 'admin.signed_out',
    entityType: 'Administrator',
    entityId: actor.id,
  });
}

export async function createAdministrator(input: z.input<typeof administratorInputSchema>) {
  const actor = await requireActor();
  const parsed = administratorInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validation('Check the administrator details.', fieldErrorsFrom(parsed.error));
  }

  const strengthProblems = validatePasswordStrength(parsed.data.password);
  if (strengthProblems.length > 0) {
    throw validation('Choose a stronger password.', { password: strengthProblems[0] as string });
  }

  const email = normaliseEmail(parsed.data.email);
  const existing = await prisma.administrator.findUnique({ where: { email } });
  if (existing) {
    throw conflict('An administrator with that email address already exists.', {
      email: 'Already in use.',
    });
  }

  const stored = await hashPassword(parsed.data.password);
  const created = await prisma.administrator.create({
    data: {
      email,
      displayName: parsed.data.displayName,
      passwordHash: stored.hash,
      passwordParameters: storedParametersToJson(stored.parameters),
    },
    select: { id: true, email: true, displayName: true, status: true, createdAt: true },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'admin.created',
    entityType: 'Administrator',
    entityId: created.id,
    summary: { email: created.email, displayName: created.displayName },
  });

  return created;
}

/**
 * Disables an administrator and revokes every session they hold.
 *
 * Revoking sessions in the same transaction is what makes "disabling one
 * administrator removes their access" true immediately rather than whenever
 * their current session happens to expire.
 */
export async function setAdministratorStatus(
  administratorId: string,
  status: 'ACTIVE' | 'DISABLED',
) {
  const actor = await requireActor();

  const target = await prisma.administrator.findUnique({ where: { id: administratorId } });
  if (!target) throw notFound('That administrator');

  if (status === 'DISABLED') {
    if (target.id === actor.id) {
      throw conflict('You cannot disable your own account while signed in to it.');
    }
    const activeCount = await prisma.administrator.count({ where: { status: 'ACTIVE' } });
    if (activeCount <= 1) {
      // Disabling the last active account would lock the club out entirely and
      // force a shell-based recovery.
      throw conflict('At least one administrator must remain active.');
    }
  }

  const updated = await prisma.administrator.update({
    where: { id: administratorId },
    data: { status },
    select: { id: true, email: true, displayName: true, status: true },
  });

  let revokedSessions = 0;
  if (status === 'DISABLED') {
    revokedSessions = await revokeAllSessionsFor(administratorId, 'administrator disabled');
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: status === 'DISABLED' ? 'admin.disabled' : 'admin.enabled',
    entityType: 'Administrator',
    entityId: administratorId,
    summary: { email: updated.email, revokedSessions },
  });

  return updated;
}

/** How long a password-reset link stays valid. */
export const RESET_TOKEN_TTL_MS = 60 * 60_000;

export interface IssuedReset {
  /** Shown to the issuing administrator exactly once, to pass on out of band. */
  readonly token: string;
  readonly expiresAt: Date;
}

export async function issuePasswordReset(administratorId: string): Promise<IssuedReset> {
  const actor = await requireActor();
  const target = await prisma.administrator.findUnique({ where: { id: administratorId } });
  if (!target) throw notFound('That administrator');

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.adminPasswordReset.create({
    data: {
      subjectId: administratorId,
      issuedById: actor.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'admin.password_reset_issued',
    entityType: 'Administrator',
    entityId: administratorId,
    summary: { email: target.email, expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Completes a reset.
 *
 * Deliberately unauthenticated — the holder of a valid, unexpired, unused token
 * is the person being recovered. Every session for the account is revoked so a
 * stolen session cannot survive the password change.
 */
export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  const strengthProblems = validatePasswordStrength(newPassword);
  if (strengthProblems.length > 0) {
    throw validation('Choose a stronger password.', { password: strengthProblems[0] as string });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const reset = await prisma.adminPasswordReset.findUnique({
    where: { tokenHash },
    include: { subject: true },
  });

  if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
    throw validation('That reset link is no longer valid. Ask an administrator for a new one.');
  }

  const stored = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.administrator.update({
      where: { id: reset.subjectId },
      data: {
        passwordHash: stored.hash,
        passwordParameters: storedParametersToJson(stored.parameters),
        passwordUpdatedAt: new Date(),
      },
    });
    await tx.adminPasswordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });
    await recordAuditEvent(
      {
        actorId: reset.subjectId,
        action: 'admin.password_changed',
        entityType: 'Administrator',
        entityId: reset.subjectId,
        summary: { via: 'reset link' },
      },
      tx,
    );
  });

  await revokeAllSessionsFor(reset.subjectId, 'password reset');
}

export async function listAdministrators() {
  await requireActor();
  return prisma.administrator.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      lastSignedInAt: true,
      createdAt: true,
      _count: { select: { sessions: { where: { revokedAt: null } } } },
    },
  });
}
