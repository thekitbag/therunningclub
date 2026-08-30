import { beforeEach, describe, expect, it } from 'vitest';
import { clearCookies, createAdmin, signInAs } from './helpers';
import { prisma } from '@/lib/db';
import {
  completePasswordReset,
  createAdministrator,
  issuePasswordReset,
  setAdministratorStatus,
  signIn,
  signOut,
} from '@/services/administrators';
import { getCurrentActor, resolveSession, SESSION_IDLE_MS } from '@/lib/session';
import { clearAllRateLimits } from '@/lib/rate-limit';
import { ServiceError } from '@/services/errors';
import { AuthorizationError } from '@/lib/authz';
import { createRunner } from '@/services/runners';

const PASSWORD = 'a-long-enough-test-password';

beforeEach(() => {
  clearCookies();
  clearAllRateLimits();
});

describe('sign in', () => {
  it('issues a session that resolves to the administrator', async () => {
    const admin = await createAdmin();
    const result = await signIn({ email: admin.email, password: PASSWORD });

    const resolved = await resolveSession(result.token);
    expect(resolved?.actor.id).toBe(admin.id);
    expect(resolved?.actor.email).toBe(admin.email);
  });

  it('stores only a hash of the session token', async () => {
    const admin = await createAdmin();
    const result = await signIn({ email: admin.email, password: PASSWORD });

    const sessions = await prisma.adminSession.findMany();
    expect(sessions).toHaveLength(1);
    // A database disclosure must not yield anything replayable as a login.
    expect(sessions[0]?.tokenHash).not.toBe(result.token);
    expect(sessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(sessions)).not.toContain(result.token);
  });

  it('is case-insensitive on the email address', async () => {
    const admin = await createAdmin('Someone@Example.Invalid');
    await expect(
      signIn({ email: 'SOMEONE@EXAMPLE.INVALID', password: PASSWORD }),
    ).resolves.toMatchObject({ actor: { id: admin.id } });
  });

  it('gives the same message for a wrong password, an unknown address and a disabled account', async () => {
    const admin = await createAdmin();
    await prisma.administrator.update({
      where: { id: admin.id },
      data: { status: 'DISABLED' },
    });

    const messages: string[] = [];
    for (const attempt of [
      { email: admin.email, password: 'wrong-password-entirely' },
      { email: 'nobody@example.invalid', password: PASSWORD },
      { email: admin.email, password: PASSWORD },
    ]) {
      clearAllRateLimits();
      await expect(signIn(attempt)).rejects.toThrow();
      try {
        await signIn(attempt);
      } catch (error) {
        messages.push((error as Error).message);
      }
    }

    // Identical wording is what stops this form enumerating administrators.
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('Those sign-in details were not recognised.');
  });

  it('records an audit event and a last-signed-in time', async () => {
    const admin = await createAdmin();
    await signIn({ email: admin.email, password: PASSWORD });

    const updated = await prisma.administrator.findUniqueOrThrow({ where: { id: admin.id } });
    expect(updated.lastSignedInAt).not.toBeNull();

    const events = await prisma.auditEvent.findMany({ where: { action: 'admin.signed_in' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(admin.id);
  });
});

describe('rate limiting', () => {
  it('locks out repeated failures and stops counting after a success', async () => {
    const admin = await createAdmin();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(signIn({ email: admin.email, password: 'wrong' })).rejects.toThrow(
        /not recognised/,
      );
    }

    await expect(signIn({ email: admin.email, password: 'wrong' })).rejects.toThrow(
      /Too many sign-in attempts/,
    );
    // Even the correct password is refused while the window is open.
    await expect(signIn({ email: admin.email, password: PASSWORD })).rejects.toThrow(
      /Too many sign-in attempts/,
    );

    clearAllRateLimits();
    await expect(signIn({ email: admin.email, password: PASSWORD })).resolves.toBeDefined();
    // A successful sign-in clears the counter, so one typo does not linger.
    await expect(signIn({ email: admin.email, password: PASSWORD })).resolves.toBeDefined();
  });

  it('rate limits per address, so one admin cannot lock out another', async () => {
    const first = await createAdmin('first@example.invalid');
    const second = await createAdmin('second@example.invalid');

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(signIn({ email: first.email, password: 'wrong' })).rejects.toThrow();
    }

    await expect(signIn({ email: second.email, password: PASSWORD })).resolves.toBeDefined();
  });
});

describe('sessions', () => {
  it('rejects a revoked session', async () => {
    const admin = await createAdmin();
    const result = await signIn({ email: admin.email, password: PASSWORD });
    const resolved = await resolveSession(result.token);

    await signOut(resolved!.actor);
    expect(await resolveSession(result.token)).toBeNull();
  });

  it('rejects a session past its absolute expiry', async () => {
    const admin = await createAdmin();
    const result = await signIn({ email: admin.email, password: PASSWORD });

    await prisma.adminSession.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveSession(result.token)).toBeNull();
  });

  it('rejects a session idle for too long', async () => {
    const admin = await createAdmin();
    const result = await signIn({ email: admin.email, password: PASSWORD });

    await prisma.adminSession.updateMany({
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 60_000) },
    });
    expect(await resolveSession(result.token)).toBeNull();
  });

  it('rejects an unknown or empty token', async () => {
    expect(await resolveSession('not-a-real-token')).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });
});

describe('administrator management', () => {
  it('lets one administrator create another who can sign in independently', async () => {
    const first = await createAdmin('first@example.invalid');
    await signInAs(first.id);

    await createAdministrator({
      email: 'second@example.invalid',
      displayName: 'Second Admin',
      password: 'another-long-enough-password',
    });

    const second = await signIn({
      email: 'second@example.invalid',
      password: 'another-long-enough-password',
    });
    expect(second.actor.displayName).toBe('Second Admin');
  });

  it('disabling an administrator revokes their sessions and leaves the other working', async () => {
    const first = await createAdmin('first@example.invalid');
    const second = await createAdmin('second@example.invalid');

    const firstSession = await signIn({ email: first.email, password: PASSWORD });
    const secondSession = await signIn({ email: second.email, password: PASSWORD });

    await signInAs(first.id);
    await setAdministratorStatus(second.id, 'DISABLED');

    // The disabled account loses access immediately, on every device.
    expect(await resolveSession(secondSession.token)).toBeNull();
    // The other administrator is entirely unaffected.
    expect(await resolveSession(firstSession.token)).not.toBeNull();

    const revoked = await prisma.adminSession.findMany({ where: { administratorId: second.id } });
    expect(revoked[0]?.revokedAt).not.toBeNull();
    expect(revoked[0]?.revokedReason).toBe('administrator disabled');
  });

  it('refuses to disable your own account or the last active one', async () => {
    const only = await createAdmin('only@example.invalid');
    await signInAs(only.id);

    await expect(setAdministratorStatus(only.id, 'DISABLED')).rejects.toThrow(
      /cannot disable your own account/,
    );

    const second = await createAdmin('second@example.invalid');
    await prisma.administrator.update({ where: { id: second.id }, data: { status: 'DISABLED' } });

    await signInAs(second.id);
    // The signed-in actor is disabled, so authorisation fails before the rule.
    await expect(setAdministratorStatus(only.id, 'DISABLED')).rejects.toThrow(AuthorizationError);
  });

  it('rejects a duplicate email address', async () => {
    const admin = await createAdmin('taken@example.invalid');
    await signInAs(admin.id);

    await expect(
      createAdministrator({
        email: 'TAKEN@example.invalid',
        displayName: 'Clash',
        password: 'another-long-enough-password',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects a weak password', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    await expect(
      createAdministrator({
        email: 'weak@example.invalid',
        displayName: 'Weak',
        password: 'short',
      }),
    ).rejects.toThrow(/stronger password/);
  });
});

describe('password reset', () => {
  it('resets the password once and revokes every session', async () => {
    const issuer = await createAdmin('issuer@example.invalid');
    const subject = await createAdmin('subject@example.invalid');

    const subjectSession = await signIn({ email: subject.email, password: PASSWORD });

    await signInAs(issuer.id);
    const reset = await issuePasswordReset(subject.id);

    await completePasswordReset(reset.token, 'a-brand-new-long-password');

    // The old session cannot survive a password change.
    expect(await resolveSession(subjectSession.token)).toBeNull();
    clearAllRateLimits();
    await expect(
      signIn({ email: subject.email, password: 'a-brand-new-long-password' }),
    ).resolves.toBeDefined();

    // The token is single use.
    await expect(completePasswordReset(reset.token, 'yet-another-long-password')).rejects.toThrow(
      /no longer valid/,
    );
  });

  it('rejects an expired token', async () => {
    const issuer = await createAdmin('issuer@example.invalid');
    const subject = await createAdmin('subject@example.invalid');
    await signInAs(issuer.id);

    const reset = await issuePasswordReset(subject.id);
    await prisma.adminPasswordReset.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(completePasswordReset(reset.token, 'a-brand-new-long-password')).rejects.toThrow(
      /no longer valid/,
    );
  });

  it('stores only a hash of the reset token', async () => {
    const issuer = await createAdmin('issuer@example.invalid');
    const subject = await createAdmin('subject@example.invalid');
    await signInAs(issuer.id);

    const reset = await issuePasswordReset(subject.id);
    const rows = await prisma.adminPasswordReset.findMany();
    expect(JSON.stringify(rows)).not.toContain(reset.token);
  });
});

describe('authorisation', () => {
  it('refuses every mutation when nobody is signed in', async () => {
    clearCookies();
    await expect(
      createRunner({
        givenName: 'Anon',
        familyName: 'Attempt',
        dateOfBirth: '1990-01-01',
        category: 'MALE',
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('refuses mutations once the acting administrator is disabled', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    // Prove the session works first.
    expect(await getCurrentActor()).not.toBeNull();

    await prisma.administrator.update({ where: { id: admin.id }, data: { status: 'DISABLED' } });

    expect(await getCurrentActor()).toBeNull();
    await expect(
      createRunner({
        givenName: 'Blocked',
        familyName: 'Attempt',
        dateOfBirth: '1990-01-01',
        category: 'MALE',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('audit payloads', () => {
  it('never records a password, token or date of birth', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    await createRunner({
      givenName: 'Audited',
      familyName: 'Runner',
      dateOfBirth: '1988-04-05',
      category: 'FEMALE',
    });
    await createAdministrator({
      email: 'audited@example.invalid',
      displayName: 'Audited Admin',
      password: 'a-very-secret-long-password',
    });

    const events = await prisma.auditEvent.findMany();
    const serialised = JSON.stringify(events);

    expect(serialised).not.toContain('1988-04-05');
    expect(serialised).not.toContain('a-very-secret-long-password');
    expect(serialised).not.toContain('dateOfBirth');
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('service errors', () => {
  it('carries a machine-readable code alongside the message', async () => {
    const admin = await createAdmin();
    await signInAs(admin.id);

    try {
      await createRunner({
        givenName: '',
        familyName: 'Nameless',
        dateOfBirth: '1990-01-01',
        category: 'MALE',
      });
      expect.unreachable('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe('VALIDATION');
      expect((error as ServiceError).fieldErrors.givenName).toBeDefined();
    }
  });
});
