import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma';
import { getConfig } from './config';

/**
 * The shared Prisma client.
 *
 * Next.js reloads modules in development, which would otherwise open a new
 * connection pool on every edit until PostgreSQL refused them, so the instance
 * is parked on `globalThis` outside production.
 */

const globalForPrisma = globalThis as unknown as { rmpacPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const config = getConfig();
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  return new PrismaClient({
    adapter,
    log: config.logLevel === 'debug' ? ['warn', 'error'] : ['error'],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.rmpacPrisma) {
    globalForPrisma.rmpacPrisma = createClient();
  }
  return globalForPrisma.rmpacPrisma;
}

/**
 * Construction is deferred until the first property access.
 *
 * `next build` imports every module to collect page data, and eagerly building
 * a client here would demand a real `DATABASE_URL` on the build machine. The
 * proxy means the connection pool is opened by the first query instead.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
});

/** Transaction client type, for services that accept either. */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export type Db = PrismaClient | PrismaTransaction;
