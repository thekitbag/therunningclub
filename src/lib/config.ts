import { z } from 'zod';

/**
 * The single place the application reads its environment.
 *
 * Everything is validated once, on first access, and a failure throws with a
 * message naming the offending variables. Production deliberately applies
 * stricter rules than development so a deployment cannot silently go live with
 * a development secret or a placeholder donation link.
 */

const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-before-production-use';
const PLACEHOLDER_JUSTGIVING = 'https://www.justgiving.com/page/example-placeholder';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  APP_ORIGIN: z
    .string()
    .url('APP_ORIGIN must be an absolute URL, for example https://rmpac.example.')
    .refine((value) => !value.endsWith('/'), 'APP_ORIGIN must not end with a trailing slash.'),
  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48',
    ),
  JUSTGIVING_URL: z.string().url('JUSTGIVING_URL must be an absolute URL.'),
  CLUB_WELCOME_COPY: z.string().optional(),
  FUNDRAISING_COPY: z.string().optional(),
  ALLOW_SAMPLE_SEED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  databaseUrl: string;
  appOrigin: string;
  sessionSecret: string;
  justGivingUrl: string;
  welcomeCopy: string;
  fundraisingCopy: string;
  allowSampleSeed: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}>;

const DEFAULT_WELCOME_COPY =
  'Royal Manor of Portland Athletic Club is a friendly running club on Portland, ' +
  'racing league fixtures, road races and a monthly time trial around the island.';

const DEFAULT_FUNDRAISING_COPY =
  'We are raising money for PSPA through the London Marathon. Every donation goes ' +
  'directly to PSPA through JustGiving.';

/**
 * True while `next build` is collecting page data.
 *
 * A build machine legitimately has no production secrets — CI builds the app
 * without ever touching the club's database or JustGiving page — so the strict
 * production rules below must not run here. They still run for real, at server
 * startup, from `src/instrumentation.ts`, which is the moment that actually
 * matters: a misconfigured deployment crashes on boot rather than serving.
 */
function isBuildPhase(env: NodeJS.ProcessEnv): boolean {
  return env.NEXT_PHASE === 'phase-production-build';
}

/** Stand-ins used only while building, never at runtime. */
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: 'postgresql://build-placeholder/none',
  APP_ORIGIN: 'https://build.invalid',
  SESSION_SECRET: 'build-time-placeholder-secret-not-used-at-runtime',
  JUSTGIVING_URL: 'https://www.justgiving.com/build-placeholder',
} as const;

export class ConfigurationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid application configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'See .env.example for the full list of required variables.',
    );
    this.name = 'ConfigurationError';
    this.problems = problems;
  }
}

/**
 * Validates a raw environment.
 *
 * Exported separately from the cached accessor so tests can exercise the rules
 * without mutating `process.env`.
 */
export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const building = isBuildPhase(env);
  const source = building ? { ...BUILD_PLACEHOLDERS, ...stripEmpty(env) } : env;
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }

  const value = parsed.data;
  const isProduction = value.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProduction && !building) {
    // These checks exist because each one has a plausible failure mode where
    // the app would otherwise start and appear healthy while being unsafe.
    if (value.SESSION_SECRET === DEV_SESSION_SECRET) {
      problems.push('SESSION_SECRET is still the development placeholder.');
    }
    if (value.JUSTGIVING_URL === PLACEHOLDER_JUSTGIVING) {
      problems.push(
        'JUSTGIVING_URL is still the placeholder. Set the club’s real JustGiving page before launch.',
      );
    }
    if (!/^https:\/\/(www\.)?justgiving\.com\//i.test(value.JUSTGIVING_URL)) {
      problems.push('JUSTGIVING_URL must be a https://www.justgiving.com address.');
    }
    // Loopback is already a secure context as far as browsers are concerned,
    // and a real deployment never has a loopback origin — so exempting it lets
    // the genuine production build be smoke-tested locally without weakening
    // the rule for anything that could actually be public.
    if (!value.APP_ORIGIN.startsWith('https://') && !isLoopbackOrigin(value.APP_ORIGIN)) {
      problems.push('APP_ORIGIN must use https in production.');
    }
    if (value.ALLOW_SAMPLE_SEED) {
      problems.push('ALLOW_SAMPLE_SEED must not be enabled in production.');
    }
  }

  if (problems.length > 0) {
    throw new ConfigurationError(problems);
  }

  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    isProduction,
    databaseUrl: value.DATABASE_URL,
    appOrigin: value.APP_ORIGIN,
    sessionSecret: value.SESSION_SECRET,
    justGivingUrl: value.JUSTGIVING_URL,
    welcomeCopy: value.CLUB_WELCOME_COPY?.trim() || DEFAULT_WELCOME_COPY,
    fundraisingCopy: value.FUNDRAISING_COPY?.trim() || DEFAULT_FUNDRAISING_COPY,
    allowSampleSeed: value.ALLOW_SAMPLE_SEED,
    logLevel: value.LOG_LEVEL,
  });
}

/** True for `http://localhost…` and `http://127.0.0.1…` style origins. */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Drops empty strings so a blank build variable falls back to a placeholder. */
function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== '') output[key] = value;
  }
  return output;
}

let cached: AppConfig | undefined;

/** The validated configuration. Throws on first call if the environment is bad. */
export function getConfig(): AppConfig {
  if (!cached) {
    cached = parseConfig(process.env);
  }
  return cached;
}

/** Test-only. Clears the memoised configuration. */
export function resetConfigCache(): void {
  cached = undefined;
}

/**
 * Validates configuration at server startup and rethrows with context.
 *
 * Called from `src/instrumentation.ts`. This is the real fail-fast gate: a
 * production deployment missing a security-critical value never reaches the
 * point of serving a request.
 */
export function assertConfigurationAtStartup(): void {
  const config = getConfig();
  if (config.isProduction) {
    // Reaching here means every production rule in parseConfig passed.
    return;
  }
}

export { DEV_SESSION_SECRET, PLACEHOLDER_JUSTGIVING, isBuildPhase };
