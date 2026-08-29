import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getConfig } from '@/lib/config';

/**
 * Health check used by Render.
 *
 * Reports process readiness plus a bounded database probe. It deliberately
 * exposes no configuration: a failing database returns `degraded` with no
 * connection string, driver message or stack trace, because this endpoint is
 * reachable without authentication.
 */

export const dynamic = 'force-dynamic';

const DATABASE_TIMEOUT_MS = 2500;

export async function GET() {
  const startedAt = Date.now();

  let configured: boolean;
  try {
    getConfig();
    configured = true;
  } catch {
    configured = false;
  }

  let database: 'ok' | 'unavailable' = 'unavailable';
  if (configured) {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), DATABASE_TIMEOUT_MS),
        ),
      ]);
      database = 'ok';
    } catch {
      database = 'unavailable';
    }
  }

  const healthy = configured && database === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      configured,
      database,
      durationMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
