import { afterAll, beforeEach } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.test'), override: true });

const { prisma } = await import('@/lib/db');
const { clearAllRateLimits } = await import('@/lib/rate-limit');

/**
 * Truncates every table between tests.
 *
 * `TRUNCATE ... CASCADE` in one statement is both fast and order-independent,
 * which matters because the schema has real foreign keys and deleting in the
 * wrong order would fail.
 */
const TABLES = [
  'tt_result',
  'tt_round',
  'tt_season',
  'championship_result',
  'race',
  'championship',
  'runner',
  'audit_event',
  'admin_password_reset',
  'admin_session',
  'administrator',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
  clearAllRateLimits();
});

afterAll(async () => {
  await prisma.$disconnect();
});
