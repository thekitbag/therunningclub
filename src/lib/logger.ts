import { getConfig } from './config';

/**
 * Structured logging with mandatory redaction.
 *
 * Every log line goes through `redact`, which drops the field names that must
 * never reach a log aggregator — passwords, tokens, secrets and dates of birth.
 * Redaction lives here rather than at each call site because a single forgotten
 * call site is exactly how personal data leaks into logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Field names whose values are never logged, matched case-insensitively. */
const REDACTED_KEYS = [
  'password',
  'passwordhash',
  'passwordconfirmation',
  'currentpassword',
  'newpassword',
  'token',
  'tokenhash',
  'sessiontoken',
  'secret',
  'sessionsecret',
  'cookie',
  'authorization',
  'dateofbirth',
  'dob',
  'csrftoken',
];

const REDACTION_PLACEHOLDER = '[redacted]';

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED_KEYS.includes(key.toLowerCase().replace(/[_-]/g, ''))
        ? REDACTION_PLACEHOLDER
        : redact(entry, depth + 1);
    }
    return output;
  }
  return value;
}

export interface LogContext {
  readonly requestId?: string;
  readonly route?: string;
  readonly actorId?: string;
  readonly durationMs?: number;
  readonly [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  let configuredLevel: LogLevel = 'info';
  try {
    configuredLevel = getConfig().logLevel;
  } catch {
    // Logging must keep working while configuration is still being validated,
    // which is precisely when a startup failure needs to be reported.
  }
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });

  if (level === 'error') {
    console.error(line);
  } else {
    console.warn(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};

/** Correlation identifier attached to a request and to any error shown to a user. */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}
