import type { Runner } from '@/generated/prisma';
import type { ScoringCategory } from '@/domain/scoring';

/**
 * The public/private boundary.
 *
 * Prisma entities are never serialised to the client. Everything a public page
 * or endpoint returns is built here, by explicitly naming the fields that are
 * allowed out. That inversion matters: adding a private column to the schema
 * later cannot leak it, because nothing in this file will mention it.
 *
 * Specifically excluded from every public shape:
 *   - `dateOfBirth` and any exact age derived from it
 *   - password hashes, session tokens and their metadata
 *   - draft records and publication/audit metadata
 *   - administrator identities
 */

export interface PublicRunner {
  readonly id: string;
  readonly displayName: string;
  readonly category: ScoringCategory;
}

/**
 * Maps a runner to its public shape.
 *
 * The parameter is typed to the exact fields used rather than to `Runner`, so
 * callers can pass a narrowed `select` and TypeScript still checks it.
 */
export function toPublicRunner(
  runner: Pick<Runner, 'id' | 'givenName' | 'familyName' | 'category'>,
): PublicRunner {
  return {
    id: runner.id,
    displayName: `${runner.givenName} ${runner.familyName}`.trim(),
    category: runner.category,
  };
}

/** Field names that must never appear in a public response. */
export const FORBIDDEN_PUBLIC_FIELDS = [
  'dateOfBirth',
  'dob',
  'age',
  'ageOnRoundDate',
  'passwordHash',
  'passwordParameters',
  'tokenHash',
  'sessionToken',
  'searchName',
  'publishedById',
  'actorId',
  'correlationId',
] as const;

/**
 * Recursively asserts that a value contains no forbidden field name.
 *
 * Used by tests and by the public JSON endpoint in development, so the privacy
 * rule is enforced by executable checks rather than by review discipline alone.
 */
export function assertNoPrivateFields(value: unknown, path = '$'): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateFields(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  if (value instanceof Date) return;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_PUBLIC_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`Private field "${key}" reached a public response at ${path}.`);
    }
    assertNoPrivateFields(entry, `${path}.${key}`);
  }
}
