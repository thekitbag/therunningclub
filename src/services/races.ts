import { z } from 'zod';
import { prisma } from '@/lib/db';
import { recordAuditEvent, changedFields } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import { parseCalendarDate } from '@/lib/dates';
import { conflict, fieldErrorsFrom, notFound, validation } from './errors';

/**
 * Race and calendar management.
 *
 * A race is the single record behind both the public Races page and a
 * championship table column, which is why the qualifier flag and short label
 * live here rather than on a separate championship-entry record.
 */

/**
 * Accepts only `http(s)` URLs.
 *
 * External links are rendered as real anchors with `target="_blank"`, so a
 * `javascript:` or `data:` URL saved by a compromised admin account would
 * otherwise become a script-execution vector for every visitor.
 */
const externalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (value === '') return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Enter a full web address beginning with https://')
  .optional()
  .or(z.literal(''));

export const raceInputSchema = z.object({
  name: z.string().trim().min(1, 'Required.').max(160),
  shortLabel: z
    .string()
    .trim()
    .min(1, 'Required — this is the championship table column heading.')
    .max(12, 'Keep it to 12 characters or fewer so the table stays readable.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  startTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, for example 10:30.')
    .optional()
    .or(z.literal('')),
  locationName: z.string().trim().max(160).optional().or(z.literal('')),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  mapUrl: externalUrlSchema,
  distanceLabel: z.string().trim().max(40).optional().or(z.literal('')),
  distanceMetres: z.coerce.number().int().positive().max(500_000).optional().nullable(),
  leagueName: z.string().trim().max(120).optional().or(z.literal('')),
  entryInstructions: z.string().trim().max(2000).optional().or(z.literal('')),
  externalUrl: externalUrlSchema,
  status: z.enum(['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED']).default('SCHEDULED'),
  isChampionshipQualifier: z.coerce.boolean().default(false),
  championshipId: z.string().uuid().optional().nullable().or(z.literal('')),
});

export type RaceInput = z.input<typeof raceInputSchema>;

function slugifyRace(name: string, date: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'race'}-${date.slice(0, 4)}`;
}

async function uniqueRaceSlug(base: string, excludeId?: string): Promise<string> {
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await prisma.race.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === excludeId) return slug;
  }
  throw conflict('Could not derive a unique race address. Try a different name.');
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves the championship a qualifying race belongs to, creating the
 * calendar-year record on demand.
 *
 * Volunteers should not have to remember to create a championship before adding
 * the first qualifying race of a new year.
 */
async function resolveChampionshipId(
  isQualifier: boolean,
  explicitId: string | null,
  date: Date,
  actorId: string,
): Promise<string | null> {
  if (!isQualifier) return null;
  if (explicitId) {
    const existing = await prisma.championship.findUnique({ where: { id: explicitId } });
    if (!existing) throw notFound('That championship');
    return existing.id;
  }

  const year = date.getUTCFullYear();
  const existing = await prisma.championship.findUnique({ where: { year } });
  if (existing) return existing.id;

  const created = await prisma.championship.create({
    data: {
      year,
      name: `Club Championship ${year}`,
      scoringRulesVersion: 'RMPAC_SCORING_V1',
    },
  });
  await recordAuditEvent({
    actorId,
    action: 'championship.created',
    entityType: 'Championship',
    entityId: created.id,
    summary: { year, createdBecause: 'first qualifying race of the year' },
  });
  return created.id;
}

export async function createRace(input: RaceInput) {
  const actor = await requireActor();
  const parsed = raceInputSchema.safeParse(input);
  if (!parsed.success) throw validation('Check the race details.', fieldErrorsFrom(parsed.error));

  const data = parsed.data;
  const date = parseCalendarDate(data.date);
  const slug = await uniqueRaceSlug(slugifyRace(data.name, data.date));
  const championshipId = await resolveChampionshipId(
    data.isChampionshipQualifier,
    emptyToNull(data.championshipId ?? null),
    date,
    actor.id,
  );

  const race = await prisma.race.create({
    data: {
      name: data.name,
      slug,
      shortLabel: data.shortLabel,
      date,
      startTime: emptyToNull(data.startTime),
      locationName: emptyToNull(data.locationName),
      address: emptyToNull(data.address),
      mapUrl: emptyToNull(data.mapUrl),
      distanceLabel: emptyToNull(data.distanceLabel),
      distanceMetres: data.distanceMetres ?? null,
      leagueName: emptyToNull(data.leagueName),
      entryInstructions: emptyToNull(data.entryInstructions),
      externalUrl: emptyToNull(data.externalUrl),
      status: data.status,
      isChampionshipQualifier: data.isChampionshipQualifier,
      championshipId,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'race.created',
    entityType: 'Race',
    entityId: race.id,
    summary: { name: race.name, date: race.date, qualifier: race.isChampionshipQualifier },
  });

  return race;
}

export async function updateRace(raceId: string, input: RaceInput) {
  const actor = await requireActor();
  const parsed = raceInputSchema.safeParse(input);
  if (!parsed.success) throw validation('Check the race details.', fieldErrorsFrom(parsed.error));

  const existing = await prisma.race.findUnique({
    where: { id: raceId },
    include: { _count: { select: { championshipResults: true } } },
  });
  if (!existing) throw notFound('That race');

  const data = parsed.data;
  const date = parseCalendarDate(data.date);

  // Removing qualifier status would orphan any placings already entered, so the
  // administrator is told to clear them first rather than losing them silently.
  if (!data.isChampionshipQualifier && existing._count.championshipResults > 0) {
    throw conflict(
      `This race has ${existing._count.championshipResults} championship result(s). ` +
        'Remove them before turning off qualifier status.',
      { isChampionshipQualifier: 'Clear the entered placings first.' },
    );
  }

  const championshipId = await resolveChampionshipId(
    data.isChampionshipQualifier,
    emptyToNull(data.championshipId ?? null) ?? existing.championshipId,
    date,
    actor.id,
  );

  const updated = await prisma.race.update({
    where: { id: raceId },
    data: {
      name: data.name,
      shortLabel: data.shortLabel,
      date,
      startTime: emptyToNull(data.startTime),
      locationName: emptyToNull(data.locationName),
      address: emptyToNull(data.address),
      mapUrl: emptyToNull(data.mapUrl),
      distanceLabel: emptyToNull(data.distanceLabel),
      distanceMetres: data.distanceMetres ?? null,
      leagueName: emptyToNull(data.leagueName),
      entryInstructions: emptyToNull(data.entryInstructions),
      externalUrl: emptyToNull(data.externalUrl),
      status: data.status,
      isChampionshipQualifier: data.isChampionshipQualifier,
      championshipId,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: 'race.updated',
    entityType: 'Race',
    entityId: raceId,
    summary: {
      changes: changedFields(existing, updated, [
        'name',
        'shortLabel',
        'date',
        'status',
        'isChampionshipQualifier',
      ]),
    },
  });

  return updated;
}

export async function setRaceState(raceId: string, state: 'DRAFT' | 'PUBLISHED') {
  const actor = await requireActor();
  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) throw notFound('That race');

  const updated = await prisma.race.update({
    where: { id: raceId },
    data: {
      state,
      publishedAt: state === 'PUBLISHED' ? new Date() : null,
      publishedById: state === 'PUBLISHED' ? actor.id : null,
    },
  });

  await recordAuditEvent({
    actorId: actor.id,
    action: state === 'PUBLISHED' ? 'race.published' : 'race.unpublished',
    entityType: 'Race',
    entityId: raceId,
    summary: { from: race.state, to: state },
  });

  return updated;
}

export async function listRacesForAdmin() {
  return prisma.race.findMany({
    orderBy: { date: 'desc' },
    include: {
      championship: { select: { id: true, year: true } },
      _count: { select: { championshipResults: true } },
    },
  });
}
