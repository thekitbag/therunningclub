import { z } from 'zod';
import { prisma, type Db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import {
  SCORING_RULES_VERSION,
  scoreChampionship,
  type ChampionshipScoring,
} from '@/domain/scoring';
import { conflict, fieldErrorsFrom, notFound, validation } from './errors';

/**
 * Club championship administration.
 *
 * Championship scoring is far simpler than the time trial: each race's scores
 * depend only on that race's own placings, so correcting one race never
 * disturbs another. There is still a full recompute on read, for the same
 * reason as the time trial — the table is always derived, never cached.
 */

export const championshipResultSchema = z.object({
  runnerId: z.string().uuid('Choose a runner.'),
  categoryPosition: z.coerce
    .number({ message: 'Enter the club position as a whole number.' })
    .int('Enter the club position as a whole number.')
    .min(1, 'The first club finisher is position 1.')
    .max(500, 'That position looks too large.'),
});

export type ChampionshipResultInput = z.input<typeof championshipResultSchema>;

export async function ensureChampionship(year: number) {
  const actor = await requireActor();
  const existing = await prisma.championship.findUnique({ where: { year } });
  if (existing) return existing;

  const created = await prisma.championship.create({
    data: {
      year,
      name: `Club Championship ${year}`,
      scoringRulesVersion: SCORING_RULES_VERSION,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'championship.created',
    entityType: 'Championship',
    entityId: created.id,
    summary: { year },
  });

  return created;
}

/**
 * Replaces the club placings recorded against a qualifying race.
 *
 * Like a time-trial round, this is a whole-race operation: positions are
 * relative to each other, so saving them one at a time would leave the table
 * temporarily inconsistent.
 */
export async function saveRaceResults(raceId: string, entries: readonly ChampionshipResultInput[]) {
  const actor = await requireActor();

  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) throw notFound('That race');
  if (!race.isChampionshipQualifier) {
    throw conflict('That race is not marked as a championship qualifier.');
  }

  const parsedEntries = entries.map((entry, index) => {
    const parsed = championshipResultSchema.safeParse(entry);
    if (!parsed.success) {
      throw validation(
        `Check row ${index + 1}.`,
        Object.fromEntries(
          Object.entries(fieldErrorsFrom(parsed.error)).map(([key, message]) => [
            `entries.${index}.${key}`,
            message,
          ]),
        ),
      );
    }
    return parsed.data;
  });

  const runnerIds = parsedEntries.map((entry) => entry.runnerId);
  const uniqueIds = new Set(runnerIds);
  if (uniqueIds.size !== runnerIds.length) {
    throw validation('A runner can only appear once in a race.');
  }

  const runners = await prisma.runner.findMany({
    where: { id: { in: [...uniqueIds] } },
    select: { id: true, category: true, status: true },
  });
  if (runners.length !== uniqueIds.size) {
    throw validation('One of the selected runners no longer exists.');
  }
  if (runners.some((runner) => runner.status === 'MERGED')) {
    throw validation('One of the selected runners has been merged into another record.');
  }

  const categoryById = new Map(runners.map((runner) => [runner.id, runner.category]));

  await prisma.$transaction(async (tx) => {
    await tx.championshipResult.deleteMany({ where: { raceId } });

    if (parsedEntries.length > 0) {
      await tx.championshipResult.createMany({
        data: parsedEntries.map((entry) => ({
          raceId,
          runnerId: entry.runnerId,
          category: categoryById.get(entry.runnerId)!,
          categoryPosition: entry.categoryPosition,
          // In v1 the score is the position. Stored explicitly so a future
          // scoring change does not have to reinterpret historical placings.
          score: entry.categoryPosition,
          scoringRulesVersion: SCORING_RULES_VERSION,
        })),
      });
    }

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'championship.result_entered',
        entityType: 'Race',
        entityId: raceId,
        summary: { resultCount: parsedEntries.length },
      },
      tx,
    );
  });

  return computeChampionshipScoring(race.championshipId!, { publishedOnly: false });
}

/** Loads a championship's raw inputs and replays the pure scorer over them. */
export async function computeChampionshipScoring(
  championshipId: string,
  options: { publishedOnly: boolean },
  db: Db = prisma,
): Promise<ChampionshipScoring> {
  const championship = await db.championship.findUnique({
    where: { id: championshipId },
    include: {
      races: {
        where: { isChampionshipQualifier: true },
        orderBy: { date: 'asc' },
        include: { championshipResults: true },
      },
    },
  });
  if (!championship) throw notFound('That championship');

  return scoreChampionship({
    year: championship.year,
    publishedOnly: options.publishedOnly,
    races: championship.races.map((race) => ({
      raceId: race.id,
      shortLabel: race.shortLabel,
      name: race.name,
      date: race.date,
      published: race.state === 'PUBLISHED',
    })),
    entries: championship.races.flatMap((race) =>
      race.championshipResults.map((result) => ({
        raceId: race.id,
        runnerId: result.runnerId,
        category: result.category,
        categoryPosition: result.categoryPosition,
      })),
    ),
  });
}

/** Same computation by calendar year, for the public route. */
export async function computeChampionshipScoringForYear(
  year: number,
  options: { publishedOnly: boolean },
): Promise<ChampionshipScoring | null> {
  const championship = await prisma.championship.findUnique({ where: { year } });
  if (!championship) return null;
  if (options.publishedOnly && championship.state !== 'PUBLISHED') return null;
  return computeChampionshipScoring(championship.id, options);
}

export async function setChampionshipState(
  championshipId: string,
  state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
) {
  const actor = await requireActor();
  const championship = await prisma.championship.findUnique({ where: { id: championshipId } });
  if (!championship) throw notFound('That championship');

  const updated = await prisma.championship.update({
    where: { id: championshipId },
    data: {
      state,
      publishedAt:
        state === 'PUBLISHED' ? (championship.publishedAt ?? new Date()) : championship.publishedAt,
      publishedById:
        state === 'PUBLISHED'
          ? (championship.publishedById ?? actor.id)
          : championship.publishedById,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: state === 'PUBLISHED' ? 'championship.published' : 'championship.updated',
    entityType: 'Championship',
    entityId: championshipId,
    summary: { from: championship.state, to: state },
  });

  return updated;
}

export interface ChampionshipImpact {
  readonly changedRunners: readonly {
    runnerName: string;
    category: 'MALE' | 'FEMALE';
    fromTotal: number | null;
    toTotal: number | null;
    fromEligible: boolean;
    toEligible: boolean;
  }[];
}

/**
 * Dry-run comparison between the published championship table and the table
 * that would result from the current draft data.
 */
export async function previewChampionshipImpact(
  championshipId: string,
): Promise<ChampionshipImpact> {
  await requireActor();

  const [before, after] = await Promise.all([
    computeChampionshipScoring(championshipId, { publishedOnly: true }),
    computeChampionshipScoring(championshipId, { publishedOnly: false }),
  ]);

  const runnerIds = new Set<string>();
  for (const category of ['MALE', 'FEMALE'] as const) {
    for (const standing of after.standings[category]) runnerIds.add(standing.runnerId);
    for (const standing of before.standings[category]) runnerIds.add(standing.runnerId);
  }

  const runners = await prisma.runner.findMany({
    where: { id: { in: [...runnerIds] } },
    select: { id: true, givenName: true, familyName: true },
  });
  const names = new Map(runners.map((r) => [r.id, `${r.givenName} ${r.familyName}`]));

  const changedRunners: ChampionshipImpact['changedRunners'][number][] = [];
  for (const category of ['MALE', 'FEMALE'] as const) {
    for (const standing of after.standings[category]) {
      const priorStanding = before.standings[category].find(
        (s) => s.runnerId === standing.runnerId,
      );
      const totalChanged = (priorStanding?.countingTotal ?? null) !== standing.countingTotal;
      const eligibilityChanged = (priorStanding?.eligible ?? false) !== standing.eligible;
      if (totalChanged || eligibilityChanged) {
        changedRunners.push({
          runnerName: names.get(standing.runnerId) ?? 'Unknown runner',
          category,
          fromTotal: priorStanding?.countingTotal ?? null,
          toTotal: standing.countingTotal,
          fromEligible: priorStanding?.eligible ?? false,
          toEligible: standing.eligible,
        });
      }
    }
  }

  return { changedRunners };
}
