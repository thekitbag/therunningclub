import { z } from 'zod';
import { Prisma } from '@/generated/prisma';
import { prisma, type Db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import { parseCalendarDate } from '@/lib/dates';
import {
  AGE_GRADE_VERSION,
  ROUNDS_PER_SEASON,
  SCORING_RULES_VERSION,
  SEASON_DISTANCES,
  distanceMetresFor,
  parseElapsedTime,
  scoreSeason,
  type DistanceChoice,
  type SeasonScoring,
  type SeasonRoundInput,
  type SeasonType,
} from '@/domain/scoring';
import { ServiceError, conflict, fieldErrorsFrom, notFound, validation } from './errors';

/**
 * Time-trial administration.
 *
 * The central design decision here: derived scoring columns are *never* patched
 * in place. Any change to a season's inputs triggers a full replay of the pure
 * domain scorer across the whole season, in ordinal order, inside one
 * transaction. Recalculating everything is cheap at club scale (six rounds, a
 * few dozen runners) and removes the entire class of bug where an edit updates
 * one row and leaves a dependent row stale.
 */

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export const seasonInputSchema = z.object({
  name: z.string().trim().min(1, 'Required.').max(120),
  type: z.enum(['SUMMER', 'WINTER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
});

export type SeasonInput = z.input<typeof seasonInputSchema>;

export function slugifySeason(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Default date range for a season type anchored on a club year. */
export function defaultSeasonDates(type: SeasonType, startYear: number) {
  return type === 'WINTER'
    ? { startDate: `${startYear}-10-01`, endDate: `${startYear + 1}-03-31` }
    : { startDate: `${startYear}-04-01`, endDate: `${startYear}-09-30` };
}

export async function createSeason(input: SeasonInput) {
  const actor = await requireActor();
  const parsed = seasonInputSchema.safeParse(input);
  if (!parsed.success) throw validation('Check the season details.', fieldErrorsFrom(parsed.error));

  const data = parsed.data;
  const startDate = parseCalendarDate(data.startDate);
  const endDate = parseCalendarDate(data.endDate);
  if (endDate <= startDate) {
    throw validation('Check the season dates.', {
      endDate: 'End date must be after the start date.',
    });
  }

  const distances = SEASON_DISTANCES[data.type];
  const baseSlug = slugifySeason(data.name);
  const slug = await uniqueSeasonSlug(baseSlug);

  const season = await prisma.ttSeason.create({
    data: {
      name: data.name,
      slug,
      type: data.type,
      startDate,
      endDate,
      clubYearLabel: seasonClubYearLabel(data.type, startDate),
      // Snapshot the distances so a later rules change cannot restate what a
      // historical season was actually run over.
      twoLapMetres: distances.TWO_LAP,
      threeLapMetres: distances.THREE_LAP,
      scoringRulesVersion: SCORING_RULES_VERSION,
      ageGradeVersion: AGE_GRADE_VERSION,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'season.created',
    entityType: 'TtSeason',
    entityId: season.id,
    summary: { name: season.name, type: season.type, slug: season.slug },
  });

  return season;
}

function seasonClubYearLabel(type: SeasonType, startDate: Date): string {
  const year = startDate.getUTCFullYear();
  return type === 'WINTER' ? `${year}/${String((year + 1) % 100).padStart(2, '0')}` : `${year}`;
}

async function uniqueSeasonSlug(base: string, db: Db = prisma): Promise<string> {
  const candidate = base || 'season';
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix + 1}`;
    const clash = await db.ttSeason.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  throw conflict('Could not derive a unique season address. Try a different name.');
}

export async function setSeasonState(seasonId: string, state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  const actor = await requireActor();
  const season = await prisma.ttSeason.findUnique({ where: { id: seasonId } });
  if (!season) throw notFound('That season');

  const updated = await prisma.ttSeason.update({
    where: { id: seasonId },
    data: {
      state,
      publishedAt: state === 'PUBLISHED' ? (season.publishedAt ?? new Date()) : season.publishedAt,
      publishedById:
        state === 'PUBLISHED' ? (season.publishedById ?? actor.id) : season.publishedById,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: state === 'PUBLISHED' ? 'season.published' : 'season.updated',
    entityType: 'TtSeason',
    entityId: seasonId,
    summary: { from: season.state, to: state },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export const roundInputSchema = z.object({
  name: z.string().trim().min(1, 'Required.').max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  ordinal: z.coerce.number().int().min(1).max(ROUNDS_PER_SEASON),
});

export type RoundInput = z.input<typeof roundInputSchema>;

export async function createRound(seasonId: string, input: RoundInput) {
  const actor = await requireActor();
  const parsed = roundInputSchema.safeParse(input);
  if (!parsed.success) throw validation('Check the round details.', fieldErrorsFrom(parsed.error));

  const season = await prisma.ttSeason.findUnique({
    where: { id: seasonId },
    include: { _count: { select: { rounds: true } } },
  });
  if (!season) throw notFound('That season');
  if (season._count.rounds >= ROUNDS_PER_SEASON) {
    throw conflict(`A season has exactly ${ROUNDS_PER_SEASON} rounds; this one is already full.`);
  }

  const data = parsed.data;
  const existingOrdinal = await prisma.ttRound.findUnique({
    where: { seasonId_ordinal: { seasonId, ordinal: data.ordinal } },
    select: { id: true },
  });
  if (existingOrdinal) {
    throw conflict('That round number already exists in this season.', {
      ordinal: `Round ${data.ordinal} already exists.`,
    });
  }

  const round = await prisma.ttRound.create({
    data: {
      seasonId,
      ordinal: data.ordinal,
      name: data.name,
      date: parseCalendarDate(data.date),
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'round.created',
    entityType: 'TtRound',
    entityId: round.id,
    summary: { seasonId, ordinal: round.ordinal, name: round.name },
  });

  return round;
}

export async function updateRound(roundId: string, input: RoundInput) {
  const actor = await requireActor();
  const parsed = roundInputSchema.safeParse(input);
  if (!parsed.success) throw validation('Check the round details.', fieldErrorsFrom(parsed.error));

  const round = await prisma.ttRound.findUnique({ where: { id: roundId } });
  if (!round) throw notFound('That round');

  const data = parsed.data;
  if (data.ordinal !== round.ordinal) {
    const clash = await prisma.ttRound.findUnique({
      where: { seasonId_ordinal: { seasonId: round.seasonId, ordinal: data.ordinal } },
      select: { id: true },
    });
    if (clash) {
      throw conflict('Another round already uses that number.', {
        ordinal: `Round ${data.ordinal} already exists.`,
      });
    }
  }

  const updated = await prisma.ttRound.update({
    where: { id: roundId },
    data: { name: data.name, date: parseCalendarDate(data.date), ordinal: data.ordinal },
  });

  // Changing a round's date or position moves it in the improvement chain, so
  // the whole season has to be replayed.
  await recalculateSeason(round.seasonId);

  await recordAuditEvent({
    actorId: actor.id,
    action: 'round.updated',
    entityType: 'TtRound',
    entityId: roundId,
    summary: { ordinal: { from: round.ordinal, to: updated.ordinal } },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const resultEntrySchema = z.object({
  runnerId: z.string().uuid('Choose a runner.'),
  distanceChoice: z.enum(['TWO_LAP', 'THREE_LAP']),
  time: z.string().trim().min(1, 'Enter a time.'),
});

export type ResultEntryInput = z.input<typeof resultEntrySchema>;

/**
 * Replaces a round's result set wholesale.
 *
 * Entering results is a whole-round operation rather than a row-at-a-time one:
 * finishing points depend on the entire field, so a partial save would leave
 * every other runner's position wrong until the last row arrived.
 */
export async function saveRoundResults(
  roundId: string,
  entries: readonly ResultEntryInput[],
): Promise<SeasonScoring> {
  const actor = await requireActor();

  const round = await prisma.ttRound.findUnique({
    where: { id: roundId },
    include: { season: true },
  });
  if (!round) throw notFound('That round');

  const parsedEntries = entries.map((entry, index) => {
    const parsed = resultEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw validation(`Check row ${index + 1}.`, prefixed(index, fieldErrorsFrom(parsed.error)));
    }
    let elapsedMilliseconds: number;
    try {
      elapsedMilliseconds = parseElapsedTime(parsed.data.time);
    } catch (error) {
      throw validation(`Check the time in row ${index + 1}.`, {
        [`entries.${index}.time`]: error instanceof Error ? error.message : 'Invalid time.',
      });
    }
    return {
      runnerId: parsed.data.runnerId,
      distanceChoice: parsed.data.distanceChoice as DistanceChoice,
      elapsedMilliseconds,
    };
  });

  const seen = new Set<string>();
  for (const [index, entry] of parsedEntries.entries()) {
    if (seen.has(entry.runnerId)) {
      throw validation('A runner can only have one result in a round.', {
        [`entries.${index}.runnerId`]: 'This runner already appears in this round.',
      });
    }
    seen.add(entry.runnerId);
  }

  const runners = await prisma.runner.findMany({
    where: { id: { in: [...seen] } },
    select: { id: true, status: true },
  });
  if (runners.length !== seen.size) {
    throw validation('One of the selected runners no longer exists.');
  }
  const merged = runners.filter((r) => r.status === 'MERGED');
  if (merged.length > 0) {
    throw validation('One of the selected runners has been merged into another record.');
  }

  await prisma.$transaction(async (tx) => {
    // Replace rather than upsert: a runner removed from the sheet must lose
    // their result, and positions have to be recomputed for everyone anyway.
    await tx.ttResult.deleteMany({ where: { roundId } });

    if (parsedEntries.length > 0) {
      await tx.ttResult.createMany({
        data: parsedEntries.map((entry) => ({
          roundId,
          runnerId: entry.runnerId,
          distanceChoice: entry.distanceChoice,
          distanceMetres: distanceMetresFor(round.season.type, entry.distanceChoice),
          elapsedMilliseconds: entry.elapsedMilliseconds,
          finishingPosition: 0,
          finishingPoints: 0,
          scoringRulesVersion: SCORING_RULES_VERSION,
          ageGradeVersion: AGE_GRADE_VERSION,
        })),
      });
    }

    await recalculateSeason(round.seasonId, tx);

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'result.entered',
        entityType: 'TtRound',
        entityId: roundId,
        summary: { resultCount: parsedEntries.length },
      },
      tx,
    );
  });

  return computeSeasonScoring(round.seasonId, { publishedOnly: false });
}

// ---------------------------------------------------------------------------
// Scoring, recalculation and preview
// ---------------------------------------------------------------------------

/**
 * Loads a season's raw inputs and replays the pure scorer over them.
 *
 * This function performs no writes, so it doubles as the dry-run preview an
 * administrator sees before confirming a consequential correction.
 */
export async function computeSeasonScoring(
  seasonId: string,
  options: { publishedOnly: boolean },
  db: Db = prisma,
): Promise<SeasonScoring> {
  const season = await db.ttSeason.findUnique({
    where: { id: seasonId },
    include: {
      rounds: {
        orderBy: { ordinal: 'asc' },
        include: {
          results: {
            include: {
              runner: {
                select: { id: true, category: true, dateOfBirth: true },
              },
            },
          },
        },
      },
    },
  });
  if (!season) throw notFound('That season');

  const rounds: SeasonRoundInput[] = season.rounds.map((round) => ({
    roundId: round.id,
    ordinal: round.ordinal,
    date: round.date,
    published: round.state === 'PUBLISHED',
    entries: round.results.map((result) => ({
      runnerId: result.runnerId,
      category: result.runner.category,
      dateOfBirth: result.runner.dateOfBirth,
      distanceChoice: result.distanceChoice,
      elapsedMilliseconds: result.elapsedMilliseconds,
    })),
  }));

  return scoreSeason({
    seasonType: season.type,
    rounds,
    publishedOnly: options.publishedOnly,
  });
}

/**
 * Rewrites every derived column in a season from its raw inputs.
 *
 * Called after any edit that can affect scoring — a time, a birth date, a
 * category, a distance, a round date, a round ordinal, or a publication state
 * change. Runs inside the caller's transaction when one is supplied so that a
 * publication and its recalculation commit together or not at all.
 */
export async function recalculateSeason(seasonId: string, db?: Db): Promise<SeasonScoring> {
  const run = async (tx: Db) => {
    // Score with drafts included: an administrator previewing a draft round
    // still needs its numbers, and the `published` flag on each round decides
    // what reaches the public standings.
    const scoring = await computeSeasonScoring(seasonId, { publishedOnly: false }, tx);

    for (const round of scoring.rounds) {
      for (const result of round.results) {
        await tx.ttResult.updateMany({
          where: { roundId: round.roundId, runnerId: result.runnerId },
          data: {
            finishingPosition: result.finishingPosition,
            finishingPoints: result.finishingPoints,
            tiedOnTime: result.tiedOnTime,
            ageGradePercent: toDecimal(result.ageGradePercent),
            ageOnRoundDate: result.ageOnRoundDate,
            previousAgeGradePercent: toDecimal(result.previousAgeGradePercent),
            previousRoundOrdinal: result.previousRoundOrdinal,
            improvement: toDecimal(result.improvement),
            improvementPosition: result.improvementPosition,
            improvementPoints: result.improvementPoints,
            roundTotal: result.roundTotal,
            scoringRulesVersion: scoring.scoringRulesVersion,
            ageGradeVersion: AGE_GRADE_VERSION,
            calculationTrace: {
              // Safe to expose: no personal data, just how the number was reached.
              finishing: `Position ${result.finishingPosition} of the ${
                result.distanceChoice === 'TWO_LAP' ? 'two-lap' : 'three-lap'
              } field`,
              improvementBasis:
                result.previousRoundOrdinal === null
                  ? 'No comparable earlier result at this distance in this season'
                  : `Compared with round ${result.previousRoundOrdinal}`,
              improverCount: round.improverCount,
            },
          },
        });
      }
    }

    return scoring;
  };

  return db ? run(db) : prisma.$transaction((tx) => run(tx));
}

function toDecimal(value: number | null): Prisma.Decimal | null {
  if (value === null || !Number.isFinite(value)) return null;
  // Round to the stored scale so the value written matches the value compared.
  return new Prisma.Decimal(value.toFixed(5));
}

export interface PublicationImpact {
  readonly roundId: string;
  readonly canPublish: boolean;
  readonly blockingProblems: readonly { runnerName: string; message: string }[];
  readonly resultCount: number;
  /** Rounds later in the season whose improvement points would change. */
  readonly affectedLaterRounds: readonly {
    ordinal: number;
    name: string;
    changedResults: number;
  }[];
  readonly standingsChanges: readonly {
    runnerName: string;
    category: 'MALE' | 'FEMALE';
    from: number | null;
    to: number;
  }[];
}

/**
 * Dry-run impact of publishing or correcting a round.
 *
 * Compares the current published picture against the one that would result, so
 * an administrator sees which later rounds and which season totals move before
 * they commit. Nothing is written.
 */
export async function previewRoundPublication(roundId: string): Promise<PublicationImpact> {
  await requireActor();

  const round = await prisma.ttRound.findUnique({
    where: { id: roundId },
    include: { season: true, _count: { select: { results: true } } },
  });
  if (!round) throw notFound('That round');

  const before = await computeSeasonScoring(round.seasonId, { publishedOnly: true });
  const after = await computeSeasonScoring(round.seasonId, { publishedOnly: false });

  const runnerNames = await loadRunnerNames(
    after.rounds.flatMap((r) => r.results.map((result) => result.runnerId)),
  );

  const blockingProblems = after.problems
    .filter((problem) => problem.roundId === roundId)
    .map((problem) => ({
      runnerName: runnerNames.get(problem.runnerId) ?? 'Unknown runner',
      message: problem.message,
    }));

  const affectedLaterRounds = after.rounds
    .filter((candidate) => candidate.roundOrdinal > round.ordinal)
    .map((candidate) => {
      const previous = before.rounds.find((r) => r.roundId === candidate.roundId);
      const changedResults = candidate.results.filter((result) => {
        const priorResult = previous?.results.find((r) => r.runnerId === result.runnerId);
        return !priorResult || priorResult.roundTotal !== result.roundTotal;
      }).length;
      return {
        ordinal: candidate.roundOrdinal,
        name: `Round ${candidate.roundOrdinal}`,
        changedResults,
      };
    })
    .filter((entry) => entry.changedResults > 0);

  const standingsChanges: Array<PublicationImpact['standingsChanges'][number]> = [];
  for (const category of ['MALE', 'FEMALE'] as const) {
    for (const standing of after.standings[category]) {
      const priorStanding = before.standings[category].find(
        (s) => s.runnerId === standing.runnerId,
      );
      if (!priorStanding || priorStanding.bestFourTotal !== standing.bestFourTotal) {
        standingsChanges.push({
          runnerName: runnerNames.get(standing.runnerId) ?? 'Unknown runner',
          category,
          from: priorStanding?.bestFourTotal ?? null,
          to: standing.bestFourTotal,
        });
      }
    }
  }

  return {
    roundId,
    canPublish: blockingProblems.length === 0 && round._count.results > 0,
    blockingProblems,
    resultCount: round._count.results,
    affectedLaterRounds,
    standingsChanges,
  };
}

async function loadRunnerNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const runners = await prisma.runner.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, givenName: true, familyName: true },
  });
  return new Map(runners.map((r) => [r.id, `${r.givenName} ${r.familyName}`]));
}

/**
 * Publishes a round and its results atomically.
 *
 * Refuses to publish while any result in the round cannot be age-graded, since
 * publishing would put an incomplete row on a public page.
 */
export async function publishRound(roundId: string) {
  const actor = await requireActor();

  return prisma.$transaction(async (tx) => {
    const round = await tx.ttRound.findUnique({
      where: { id: roundId },
      include: { _count: { select: { results: true } } },
    });
    if (!round) throw notFound('That round');
    if (round._count.results === 0) {
      throw validation('Add at least one result before publishing this round.');
    }

    const scoring = await computeSeasonScoring(round.seasonId, { publishedOnly: false }, tx);
    const problems = scoring.problems.filter((problem) => problem.roundId === roundId);
    if (problems.length > 0) {
      throw new ServiceError(
        'BLOCKED_BY_VALIDATION',
        `This round cannot be published yet: ${problems[0]?.message ?? 'a result could not be scored.'}`,
      );
    }

    const updated = await tx.ttRound.update({
      where: { id: roundId },
      data: { state: 'PUBLISHED', publishedAt: new Date(), publishedById: actor.id },
    });

    // Publishing changes which rounds feed the improvement chain, so the season
    // is replayed inside the same transaction.
    await recalculateSeason(round.seasonId, tx);

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'round.published',
        entityType: 'TtRound',
        entityId: roundId,
        summary: { resultCount: round._count.results },
      },
      tx,
    );

    return updated;
  });
}

export async function unpublishRound(roundId: string) {
  const actor = await requireActor();

  return prisma.$transaction(async (tx) => {
    const round = await tx.ttRound.findUnique({ where: { id: roundId } });
    if (!round) throw notFound('That round');

    const updated = await tx.ttRound.update({
      where: { id: roundId },
      data: { state: 'DRAFT', publishedAt: null, publishedById: null },
    });

    await recalculateSeason(round.seasonId, tx);

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'round.unpublished',
        entityType: 'TtRound',
        entityId: roundId,
        summary: { ordinal: round.ordinal },
      },
      tx,
    );

    return updated;
  });
}

function prefixed(index: number, errors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).map(([key, message]) => [`entries.${index}.${key}`, message]),
  );
}
