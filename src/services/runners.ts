import { z } from 'zod';
import { prisma, type Db } from '@/lib/db';
import { recordAuditEvent, changedFields } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import { parseCalendarDate } from '@/lib/dates';
import { ServiceError, conflict, fieldErrorsFrom, notFound, validation } from './errors';
import { recalculateSeason } from './time-trials';
import type { Runner } from '@/generated/prisma';

/**
 * Runner management.
 *
 * Runners are never hard-deleted once they have results: competition history
 * has to stay intact and correct, so the only removal operations are
 * deactivation and merging into a surviving record.
 */

/**
 * Normalises a name for duplicate detection and search.
 *
 * Accents are folded and punctuation dropped so that "Siân O'Brien" and
 * "Sian OBrien" collide as likely duplicates rather than quietly becoming two
 * runners whose results are split across both records.
 */
export function normaliseSearchName(givenName: string, familyName: string): string {
  return `${givenName} ${familyName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const nameSchema = z.string().trim().min(1, 'Required.').max(80, 'Must be 80 characters or fewer.');

export const runnerInputSchema = z.object({
  givenName: nameSchema,
  familyName: nameSchema,
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker, or type YYYY-MM-DD.'),
  category: z.enum(['MALE', 'FEMALE']),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type RunnerInput = z.input<typeof runnerInputSchema>;

function parseDateOfBirth(value: string): Date {
  let date: Date;
  try {
    date = parseCalendarDate(value);
  } catch (error) {
    throw validation('Check the date of birth.', {
      dateOfBirth: error instanceof Error ? error.message : 'Invalid date.',
    });
  }

  const now = new Date();
  if (date.getTime() > now.getTime()) {
    throw validation('Check the date of birth.', {
      dateOfBirth: 'Date of birth cannot be in the future.',
    });
  }
  if (date.getUTCFullYear() < 1900) {
    throw validation('Check the date of birth.', {
      dateOfBirth: 'Date of birth must be after 1900.',
    });
  }
  return date;
}

export interface DuplicateCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly status: Runner['status'];
  /** Why this record was flagged, so the administrator can judge it. */
  readonly reason: 'SAME_NAME_AND_BIRTH_DATE' | 'SAME_NAME';
}

/**
 * Finds records that might already represent this person.
 *
 * A matching name *and* birth date is near-certain; a matching name alone is
 * merely worth a look. Both are surfaced, ordered strongest first, and the
 * administrator decides — the system never merges automatically.
 */
export async function findDuplicateCandidates(
  input: { givenName: string; familyName: string; dateOfBirth?: string },
  excludeId?: string,
  db: Db = prisma,
): Promise<DuplicateCandidate[]> {
  const searchName = normaliseSearchName(input.givenName, input.familyName);
  if (!searchName) return [];

  const matches = await db.runner.findMany({
    where: {
      searchName,
      status: { not: 'MERGED' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, givenName: true, familyName: true, status: true, dateOfBirth: true },
    take: 20,
  });

  let birthDate: Date | null = null;
  if (input.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    try {
      birthDate = parseCalendarDate(input.dateOfBirth);
    } catch {
      birthDate = null;
    }
  }

  return matches
    .map((match) => ({
      id: match.id,
      displayName: `${match.givenName} ${match.familyName}`,
      status: match.status,
      reason:
        birthDate && match.dateOfBirth.getTime() === birthDate.getTime()
          ? ('SAME_NAME_AND_BIRTH_DATE' as const)
          : ('SAME_NAME' as const),
    }))
    .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'SAME_NAME_AND_BIRTH_DATE' ? -1 : 1));
}

export async function createRunner(input: RunnerInput): Promise<Runner> {
  const actor = await requireActor();
  const parsed = runnerInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validation('Check the runner details.', fieldErrorsFrom(parsed.error));
  }

  const data = parsed.data;
  const dateOfBirth = parseDateOfBirth(data.dateOfBirth);

  const runner = await prisma.runner.create({
    data: {
      givenName: data.givenName,
      familyName: data.familyName,
      searchName: normaliseSearchName(data.givenName, data.familyName),
      dateOfBirth,
      category: data.category,
      status: data.status,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'runner.created',
    entityType: 'Runner',
    entityId: runner.id,
    // The birth date is deliberately omitted; the audit records that a runner
    // was created, not the personal data they were created with.
    summary: {
      givenName: runner.givenName,
      familyName: runner.familyName,
      category: runner.category,
    },
  });

  return runner;
}

export async function updateRunner(id: string, input: RunnerInput): Promise<Runner> {
  const actor = await requireActor();
  const parsed = runnerInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validation('Check the runner details.', fieldErrorsFrom(parsed.error));
  }

  const existing = await prisma.runner.findUnique({ where: { id } });
  if (!existing) throw notFound('That runner');
  if (existing.status === 'MERGED') {
    throw conflict('That runner has been merged into another record and cannot be edited.');
  }

  const data = parsed.data;
  const dateOfBirth = parseDateOfBirth(data.dateOfBirth);

  const updated = await prisma.runner.update({
    where: { id },
    data: {
      givenName: data.givenName,
      familyName: data.familyName,
      searchName: normaliseSearchName(data.givenName, data.familyName),
      dateOfBirth,
      category: data.category,
      status: data.status,
    },
  });

  // Only these two feed the scoring domain; a name change cannot move a point.
  const scoringInputChanged =
    existing.dateOfBirth.getTime() !== updated.dateOfBirth.getTime() ||
    existing.category !== updated.category;

  const recalculatedSeasons = scoringInputChanged ? await recalculateSeasonsFor(id) : [];

  const changes = changedFields(existing, updated, [
    'givenName',
    'familyName',
    'category',
    'status',
  ]);
  // Record only that the birth date moved, never the values themselves.
  if (existing.dateOfBirth.getTime() !== updated.dateOfBirth.getTime()) {
    changes.dateOfBirth = { from: '[changed]', to: '[changed]' };
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: 'runner.updated',
    entityType: 'Runner',
    entityId: id,
    summary: { changes, recalculatedSeasons: recalculatedSeasons.length },
  });

  return updated;
}

/** Deactivates a runner. Results are untouched and stay in published tables. */
export async function deactivateRunner(id: string): Promise<Runner> {
  const actor = await requireActor();
  const existing = await prisma.runner.findUnique({ where: { id } });
  if (!existing) throw notFound('That runner');

  const updated = await prisma.runner.update({ where: { id }, data: { status: 'INACTIVE' } });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'runner.deactivated',
    entityType: 'Runner',
    entityId: id,
    summary: { previousStatus: existing.status },
  });

  return updated;
}

export interface MergeOutcome {
  readonly survivingRunnerId: string;
  readonly movedTimeTrialResults: number;
  readonly movedChampionshipResults: number;
  readonly skippedTimeTrialResults: number;
  readonly skippedChampionshipResults: number;
}

/**
 * Merges a duplicate into a surviving runner.
 *
 * Results move across in one transaction. Where both records already hold a
 * result for the same round or race the duplicate's copy is left behind rather
 * than overwriting the survivor's, because the uniqueness constraint says only
 * one can exist and silently choosing for the administrator would be wrong.
 * The count of skipped rows is returned so the UI can say what happened.
 */
export async function mergeRunners(
  duplicateId: string,
  survivingId: string,
): Promise<MergeOutcome> {
  const actor = await requireActor();
  if (duplicateId === survivingId) {
    throw validation('Choose two different runners to merge.');
  }

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.runner.findUnique({ where: { id: duplicateId } });
    const surviving = await tx.runner.findUnique({ where: { id: survivingId } });
    if (!duplicate) throw notFound('The duplicate runner');
    if (!surviving) throw notFound('The surviving runner');
    if (surviving.status === 'MERGED') {
      throw conflict('The surviving runner has itself been merged into another record.');
    }

    const [existingTt, existingChamp] = await Promise.all([
      tx.ttResult.findMany({ where: { runnerId: survivingId }, select: { roundId: true } }),
      tx.championshipResult.findMany({
        where: { runnerId: survivingId },
        select: { raceId: true },
      }),
    ]);
    const occupiedRounds = new Set(existingTt.map((r) => r.roundId));
    const occupiedRaces = new Set(existingChamp.map((r) => r.raceId));

    const [duplicateTt, duplicateChamp] = await Promise.all([
      tx.ttResult.findMany({
        where: { runnerId: duplicateId },
        select: { id: true, roundId: true },
      }),
      tx.championshipResult.findMany({
        where: { runnerId: duplicateId },
        select: { id: true, raceId: true },
      }),
    ]);

    const movableTt = duplicateTt.filter((r) => !occupiedRounds.has(r.roundId));
    const movableChamp = duplicateChamp.filter((r) => !occupiedRaces.has(r.raceId));

    if (movableTt.length > 0) {
      await tx.ttResult.updateMany({
        where: { id: { in: movableTt.map((r) => r.id) } },
        data: { runnerId: survivingId },
      });
    }
    if (movableChamp.length > 0) {
      await tx.championshipResult.updateMany({
        where: { id: { in: movableChamp.map((r) => r.id) } },
        data: { runnerId: survivingId },
      });
    }

    await tx.runner.update({
      where: { id: duplicateId },
      data: { status: 'MERGED', canonicalRunnerId: survivingId },
    });

    const outcome: MergeOutcome = {
      survivingRunnerId: survivingId,
      movedTimeTrialResults: movableTt.length,
      movedChampionshipResults: movableChamp.length,
      skippedTimeTrialResults: duplicateTt.length - movableTt.length,
      skippedChampionshipResults: duplicateChamp.length - movableChamp.length,
    };

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'runner.merged',
        entityType: 'Runner',
        entityId: duplicateId,
        summary: { ...outcome },
      },
      tx,
    );

    return outcome;
  });
}

/**
 * Merges two runners and replays every season the moved results landed in.
 *
 * The results now belong to a person with a different date of birth and
 * possibly a different category, so their age grades — and everyone else's
 * improvement ranking in those rounds — have to be recomputed.
 */
export async function mergeRunnersAndRecalculate(
  duplicateId: string,
  survivingId: string,
): Promise<MergeOutcome> {
  const outcome = await mergeRunners(duplicateId, survivingId);
  await recalculateSeasonsFor(survivingId);
  return outcome;
}

export interface RunnerListItem {
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly displayName: string;
  readonly category: Runner['category'];
  readonly status: Runner['status'];
  readonly resultCount: number;
}

/** Admin-facing runner list. Still excludes the date of birth from the shape. */
export async function listRunners(options?: {
  search?: string;
  includeInactive?: boolean;
}): Promise<RunnerListItem[]> {
  const search = options?.search?.trim();
  const runners = await prisma.runner.findMany({
    where: {
      status: options?.includeInactive ? { not: 'MERGED' } : 'ACTIVE',
      ...(search
        ? {
            searchName: { contains: normaliseSearchName(search, ''), mode: 'insensitive' as const },
          }
        : {}),
    },
    select: {
      id: true,
      givenName: true,
      familyName: true,
      category: true,
      status: true,
      _count: { select: { timeTrialResults: true, championshipResults: true } },
    },
    orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
  });

  return runners.map((runner) => ({
    id: runner.id,
    givenName: runner.givenName,
    familyName: runner.familyName,
    displayName: `${runner.givenName} ${runner.familyName}`,
    category: runner.category,
    status: runner.status,
    resultCount: runner._count.timeTrialResults + runner._count.championshipResults,
  }));
}

/**
 * Replays scoring for every season this runner has a result in.
 *
 * A runner's date of birth and scoring category are inputs to their age grade,
 * which in turn drives improvement points for themselves and — because
 * improvement is ranked across the whole field — for everyone else in those
 * rounds. Editing either therefore invalidates stored derived columns across
 * potentially several seasons, so all of them are replayed.
 */
async function recalculateSeasonsFor(runnerId: string): Promise<string[]> {
  const results = await prisma.ttResult.findMany({
    where: { runnerId },
    select: { round: { select: { seasonId: true } } },
  });
  const seasonIds = [...new Set(results.map((result) => result.round.seasonId))];
  for (const seasonId of seasonIds) {
    await recalculateSeason(seasonId);
  }
  return seasonIds;
}

export { ServiceError, fieldErrorsFrom };
