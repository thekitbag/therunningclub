/**
 * Creates or recovers the first administrator account.
 *
 * This is the only way an account can come into existence without an existing
 * administrator, and it is therefore also the recovery path if every account is
 * locked out. It is deliberately a command rather than a web page: a
 * publicly-reachable "create the first admin" screen is a well-known way to
 * lose a site to whoever finds it first.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... \
 *   BOOTSTRAP_ADMIN_NAME="Club Secretary" npm run bootstrap:admin
 *
 * Set BOOTSTRAP_ADMIN_RESET=true to reset an existing account's password and
 * revoke its sessions. Without it, an existing account is left untouched.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import {
  hashPassword,
  storedParametersToJson,
  validatePasswordStrength,
} from '../src/lib/password';

async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim() || 'Club Administrator';
  const allowReset = process.env.BOOTSTRAP_ADMIN_RESET === 'true';

  const problems: string[] = [];
  if (!email) problems.push('BOOTSTRAP_ADMIN_EMAIL is required.');
  if (!email.includes('@')) problems.push('BOOTSTRAP_ADMIN_EMAIL must be an email address.');
  if (!password) problems.push('BOOTSTRAP_ADMIN_PASSWORD is required.');
  problems.push(...validatePasswordStrength(password).map((p) => `BOOTSTRAP_ADMIN_PASSWORD: ${p}`));

  if (problems.length > 0) {
    console.error('\nCannot bootstrap an administrator:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nSee .env.example for the full list of variables.\n');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existing = await prisma.administrator.findUnique({ where: { email } });

    if (existing && !allowReset) {
      console.log(
        `\nAn administrator with ${email} already exists (status: ${existing.status}).\n` +
          'Nothing changed. Set BOOTSTRAP_ADMIN_RESET=true to reset its password.\n',
      );
      return;
    }

    const stored = await hashPassword(password);

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.administrator.update({
          where: { id: existing.id },
          data: {
            displayName,
            status: 'ACTIVE',
            passwordHash: stored.hash,
            passwordParameters: storedParametersToJson(stored.parameters),
            passwordUpdatedAt: new Date(),
          },
        });
        // A recovery reset must invalidate whatever sessions caused the lockout.
        await tx.adminSession.updateMany({
          where: { administratorId: existing.id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'bootstrap reset' },
        });
        await tx.auditEvent.create({
          data: {
            actorId: existing.id,
            action: 'admin.password_changed',
            entityType: 'Administrator',
            entityId: existing.id,
            summary: { via: 'bootstrap command' },
          },
        });
      });
      console.log(`\nReset the password for ${email} and revoked its sessions.\n`);
      return;
    }

    const created = await prisma.administrator.create({
      data: {
        email,
        displayName,
        passwordHash: stored.hash,
        passwordParameters: storedParametersToJson(stored.parameters),
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: created.id,
        action: 'admin.created',
        entityType: 'Administrator',
        entityId: created.id,
        summary: { email, via: 'bootstrap command' },
      },
    });

    console.log(
      `\nCreated administrator ${displayName} <${email}>.\n\n` +
        'Next steps:\n' +
        '  1. Remove BOOTSTRAP_ADMIN_* from the environment.\n' +
        '  2. Sign in at /admin/sign-in and change the password.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
