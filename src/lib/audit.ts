import { prisma, type Db } from './db';
import { redact } from './logger';

/**
 * Audit trail for administrator mutations.
 *
 * The summary is passed through the same redaction used for logs, so a caller
 * that accidentally hands over a whole form body cannot write a password or a
 * date of birth into the audit table.
 */

export type AuditAction =
  | 'admin.signed_in'
  | 'admin.signed_out'
  | 'admin.created'
  | 'admin.disabled'
  | 'admin.enabled'
  | 'admin.password_reset_issued'
  | 'admin.password_changed'
  | 'runner.created'
  | 'runner.updated'
  | 'runner.deactivated'
  | 'runner.merged'
  | 'season.created'
  | 'season.updated'
  | 'season.published'
  | 'season.unpublished'
  | 'round.created'
  | 'round.updated'
  | 'round.published'
  | 'round.unpublished'
  | 'result.entered'
  | 'result.updated'
  | 'result.deleted'
  | 'race.created'
  | 'race.updated'
  | 'race.published'
  | 'race.unpublished'
  | 'championship.created'
  | 'championship.updated'
  | 'championship.published'
  | 'championship.result_entered'
  | 'championship.result_updated'
  | 'championship.result_deleted';

export interface AuditInput {
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly summary?: Record<string, unknown>;
  readonly correlationId?: string;
}

export async function recordAuditEvent(input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary ? (redact(input.summary) as object) : undefined,
      correlationId: input.correlationId ?? null,
    },
  });
}

/**
 * Builds a changed-field summary from a before/after pair.
 *
 * Only field names and their values for fields that actually changed are
 * recorded, which keeps the audit useful without copying whole rows.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T | null,
  after: T,
  fields: readonly (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const from = before ? before[field] : undefined;
    const to = after[field];
    if (!valuesEqual(from, to)) {
      changes[String(field)] = { from: from ?? null, to: to ?? null };
    }
  }
  return changes;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
