import { z } from 'zod';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit';
import { requireActor } from '@/lib/authz';
import { parseCalendarDate } from '@/lib/dates';
import { recalculateSeasonAndFollowing } from './time-trials';
import { fieldErrorsFrom, validation } from './errors';
import { normaliseSearchName } from './runners';

const importSchema = z.object({
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  sourceLabel: z.string().trim().max(160, 'Use 160 characters or fewer.').optional(),
  csv: z.string().min(1, 'Choose a CSV file.').max(256_000, 'The CSV must be smaller than 256 KB.'),
});

export interface AgeGradeBaselineImportInput {
  readonly recordedOn: string;
  readonly sourceLabel?: string;
  readonly csv: string;
}

export interface AgeGradeBaselineImportOutcome {
  readonly imported: number;
  readonly created: number;
  readonly updated: number;
  readonly recalculatedFromSeasonId: string | null;
}

interface CsvRow {
  readonly line: number;
  readonly values: readonly string[];
}

/**
 * Imports one opening age grade per runner and then replays all affected
 * seasons. The file is fully parsed, matched and validated before the
 * transaction starts, so a bad row can never cause a partial import.
 */
export async function importAgeGradeBaselines(
  input: AgeGradeBaselineImportInput,
): Promise<AgeGradeBaselineImportOutcome> {
  const actor = await requireActor();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    throw validation('Check the historical age-grade import.', fieldErrorsFrom(parsed.error));
  }

  let recordedOn: Date;
  try {
    recordedOn = parseCalendarDate(parsed.data.recordedOn);
  } catch (error) {
    throw validation('Check the historical age-grade date.', {
      recordedOn: error instanceof Error ? error.message : 'Invalid date.',
    });
  }
  if (recordedOn.getTime() >= Date.now()) {
    throw validation('Check the historical age-grade date.', {
      recordedOn: 'The opening baseline must be in the past.',
    });
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) {
    throw validation('The CSV needs a header row and at least one runner.');
  }

  const headers = rows[0]?.values.map(normaliseHeader) ?? [];
  const runnerIdColumn = findColumn(headers, ['runner_id', 'runnerid', 'id']);
  const runnerNameColumn = findColumn(headers, ['runner_name', 'runner', 'name']);
  const ageGradeColumn = findColumn(headers, [
    'previous_age_grade',
    'previous_ag',
    'last_age_grade',
    'last_ag',
    'age_grade',
    'agegrade',
  ]);

  if (ageGradeColumn === -1 || (runnerIdColumn === -1 && runnerNameColumn === -1)) {
    throw validation(
      'Use columns “Runner name” and “Previous age grade” (or “Runner ID” and “Previous age grade”).',
    );
  }

  const runners = await prisma.runner.findMany({
    where: { status: { not: 'MERGED' } },
    select: { id: true, givenName: true, familyName: true },
  });
  const byId = new Map(runners.map((runner) => [runner.id, runner]));
  const byName = new Map<string, typeof runners>();
  for (const runner of runners) {
    for (const key of [
      normaliseSearchName(runner.givenName, runner.familyName),
      normaliseSearchName(runner.familyName, runner.givenName),
    ]) {
      const matches = byName.get(key) ?? [];
      if (!matches.some((match) => match.id === runner.id)) matches.push(runner);
      byName.set(key, matches);
    }
  }

  const values: Array<{ runnerId: string; ageGradePercent: number; line: number }> = [];
  const errors: string[] = [];
  const seenRunnerIds = new Set<string>();

  for (const row of rows.slice(1)) {
    if (row.values.every((value) => value.trim() === '')) continue;

    const rawId = runnerIdColumn === -1 ? '' : (row.values[runnerIdColumn] ?? '').trim();
    const rawName = runnerNameColumn === -1 ? '' : (row.values[runnerNameColumn] ?? '').trim();
    const rawAgeGrade = (row.values[ageGradeColumn] ?? '').trim().replace(/%$/, '').trim();

    const runner = rawId ? byId.get(rawId) : matchRunnerName(rawName, byName);
    if (!runner) {
      errors.push(
        rawId
          ? `line ${row.line}: runner ID “${rawId}” was not found`
          : `line ${row.line}: runner “${rawName || '[blank]'}” was not found or is ambiguous`,
      );
      continue;
    }

    const ageGradePercent = Number(rawAgeGrade);
    if (!Number.isFinite(ageGradePercent) || ageGradePercent <= 0 || ageGradePercent > 200) {
      errors.push(`line ${row.line}: “${rawAgeGrade || '[blank]'}” is not a valid age grade`);
      continue;
    }
    if (seenRunnerIds.has(runner.id)) {
      errors.push(
        `line ${row.line}: ${runner.givenName} ${runner.familyName} appears more than once`,
      );
      continue;
    }

    seenRunnerIds.add(runner.id);
    values.push({ runnerId: runner.id, ageGradePercent, line: row.line });
  }

  if (values.length === 0 && errors.length === 0) {
    errors.push('the CSV contains no data rows');
  }

  const earliestResults =
    values.length === 0
      ? []
      : await prisma.ttResult.findMany({
          where: {
            runnerId: { in: values.map((value) => value.runnerId) },
          },
          select: { runnerId: true, round: { select: { date: true } } },
          orderBy: { round: { date: 'asc' } },
        });
  const firstDateByRunner = new Map<string, Date>();
  for (const result of earliestResults) {
    if (!firstDateByRunner.has(result.runnerId)) {
      firstDateByRunner.set(result.runnerId, result.round.date);
    }
  }
  for (const value of values) {
    const firstDate = firstDateByRunner.get(value.runnerId);
    if (firstDate && recordedOn.getTime() >= firstDate.getTime()) {
      errors.push(
        `line ${value.line}: the baseline date must be earlier than this runner's first published result`,
      );
    }
  }

  if (errors.length > 0) {
    throw validation(
      `Nothing was imported. Fix ${errors.slice(0, 8).join('; ')}${
        errors.length > 8 ? `; and ${errors.length - 8} more error(s)` : ''
      }.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.ttAgeGradeBaseline.findMany({
      where: { runnerId: { in: values.map((value) => value.runnerId) } },
      select: { runnerId: true },
    });
    const existingIds = new Set(existing.map((baseline) => baseline.runnerId));

    for (const value of values) {
      await tx.ttAgeGradeBaseline.upsert({
        where: { runnerId: value.runnerId },
        create: {
          runnerId: value.runnerId,
          recordedOn,
          ageGradePercent: new Prisma.Decimal(value.ageGradePercent.toFixed(5)),
          sourceLabel: parsed.data.sourceLabel || null,
        },
        update: {
          recordedOn,
          ageGradePercent: new Prisma.Decimal(value.ageGradePercent.toFixed(5)),
          sourceLabel: parsed.data.sourceLabel || null,
        },
      });
    }

    const earliestSeason = await tx.ttSeason.findFirst({
      where: {
        rounds: {
          some: { results: { some: { runnerId: { in: values.map((v) => v.runnerId) } } } },
        },
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (earliestSeason) {
      await recalculateSeasonAndFollowing(earliestSeason.id, tx);
    }

    await recordAuditEvent(
      {
        actorId: actor.id,
        action: 'age-grade-baseline.imported',
        entityType: 'TtAgeGradeBaseline',
        entityId: null,
        summary: {
          imported: values.length,
          created: values.length - existingIds.size,
          updated: existingIds.size,
          recordedOn: parsed.data.recordedOn,
          sourceLabel: parsed.data.sourceLabel || null,
          recalculatedFromSeasonId: earliestSeason?.id ?? null,
        },
      },
      tx,
    );

    return {
      imported: values.length,
      created: values.length - existingIds.size,
      updated: existingIds.size,
      recalculatedFromSeasonId: earliestSeason?.id ?? null,
    };
  });
}

function normaliseHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findColumn(headers: readonly string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function matchRunnerName<T>(rawName: string, byName: ReadonlyMap<string, readonly T[]>): T | null {
  if (!rawName) return null;
  const commaParts = rawName.split(',').map((part) => part.trim());
  const key =
    commaParts.length === 2
      ? normaliseSearchName(commaParts[1] ?? '', commaParts[0] ?? '')
      : normaliseSearchName(rawName, '');
  const matches = byName.get(key) ?? [];
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Minimal RFC 4180 reader: quoted commas, quotes and line breaks are supported. */
export function parseCsv(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let values: string[] = [];
  let value = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
        if (char === '\n') line += 1;
      }
      continue;
    }

    if (char === '"' && value === '') quoted = true;
    else if (char === ',') {
      values.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      values.push(value);
      rows.push({ line: rowLine, values });
      values = [];
      value = '';
      line += 1;
      rowLine = line;
    } else value += char;
  }

  if (quoted) throw validation(`Nothing was imported. Line ${rowLine} has an unclosed quote.`);
  if (value !== '' || values.length > 0) {
    values.push(value);
    rows.push({ line: rowLine, values });
  }
  return rows;
}
