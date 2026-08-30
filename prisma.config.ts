import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads the migration connection URL from here rather than from the
 * schema. At runtime the application does not use this file at all: it builds a
 * `PrismaClient` over the pg driver adapter in `src/lib/db.ts`.
 *
 * `dotenv/config` is imported so that `prisma migrate` picks up `.env` (or, via
 * `dotenv -e .env.test`, the isolated test database) exactly like the app does.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed-sample.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
