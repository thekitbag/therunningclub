/**
 * Generates the vendored RunBundle-compatible 2025 road age-factor table.
 *
 * Usage:
 *   npm run gen:age-grade -- /path/to/MaleRoadStd2025.xlsx /path/to/FemaleRoadStd2025.xlsx
 *
 * Pass `--stdout` to inspect the generated module without writing it. The
 * workbooks are intentionally supplied by the caller: generation is an
 * explicit source-data update, not a network operation hidden in a build.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCE_COLUMNS = ['5 km', '6 km', '4 Mile', '8 km'] as const;
const REFERENCE_DISTANCES = [5000, 6000, 6437.376, 8000] as const;

type CellValue = string | number;
type Row = Readonly<Record<string, CellValue>>;

function xmlPart(workbookPath: string, part: string): string {
  return execFileSync('unzip', ['-p', workbookPath, part], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function sharedStrings(workbookPath: string): readonly string[] {
  const xml = xmlPart(workbookPath, 'xl/sharedStrings.xml');
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml(
      [...match[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1]!).join(''),
    ),
  );
}

function rows(workbookPath: string): readonly Row[] {
  const strings = sharedStrings(workbookPath);
  const xml = xmlPart(workbookPath, 'xl/worksheets/sheet1.xml');

  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row: Record<string, CellValue> = {};
    for (const cellMatch of rowMatch[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]!;
      const reference = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const raw = /<v>([^<]*)<\/v>/.exec(cellMatch[2]!)?.[1];
      if (!reference || raw === undefined) continue;
      row[reference] = /\bt="s"/.test(attributes) ? (strings[Number(raw)] ?? '') : Number(raw);
    }
    return row;
  });
}

function workbookData(workbookPath: string) {
  const parsedRows = rows(workbookPath);
  const header = parsedRows.find((row) =>
    REFERENCE_COLUMNS.every((name) => name in rowValues(row)),
  );
  if (!header) throw new Error(`Could not find the distance header in ${workbookPath}.`);

  const columns = Object.fromEntries(
    REFERENCE_COLUMNS.map((name) => {
      const entry = Object.entries(header).find(([, value]) => value === name);
      if (!entry) throw new Error(`Missing ${name} in ${workbookPath}.`);
      return [name, entry[0]];
    }),
  ) as Record<(typeof REFERENCE_COLUMNS)[number], string>;
  const ageColumns = Object.entries(header)
    .filter(([, value]) => value === 'Age')
    .map(([column]) => column);
  if (ageColumns.length === 0) throw new Error(`Could not find an age column in ${workbookPath}.`);

  const openClassRow = parsedRows.find((row) => Object.values(row).includes('OC sec'));
  if (!openClassRow) throw new Error(`Could not find open-class standards in ${workbookPath}.`);
  const openClassStandards = REFERENCE_COLUMNS.map((name) => numeric(openClassRow[columns[name]]));

  const factors: Record<number, readonly number[]> = {};
  for (const row of parsedRows) {
    const age = ageColumns.map((column) => row[column]).find((value) => isTableAge(value));
    if (typeof age !== 'number') continue;
    factors[age] = REFERENCE_COLUMNS.map((name) => Number(numeric(row[columns[name]]).toFixed(4)));
  }
  for (let age = 5; age <= 100; age += 1) {
    if (!factors[age]) throw new Error(`Missing age ${age} in ${workbookPath}.`);
  }

  return { openClassStandards, factors };
}

function rowValues(row: Row): Readonly<Record<string, true>> {
  return Object.fromEntries(Object.values(row).map((value) => [String(value), true]));
}

function numeric(value: CellValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected a finite numeric workbook cell, received ${String(value)}.`);
  }
  return value;
}

function isTableAge(value: CellValue | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 100;
}

function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function factorRows(name: string, factors: Readonly<Record<number, readonly number[]>>): string {
  const body = Object.entries(factors)
    .map(([age, values]) => `  ${age}: [${values.map((value) => value.toFixed(4)).join(', ')}],`)
    .join('\n');
  return `export const ${name}: Readonly<Record<number, AgeFactorRow>> = {\n${body}\n};`;
}

function moduleSource(malePath: string, femalePath: string): string {
  const male = workbookData(malePath);
  const female = workbookData(femalePath);
  return `/**
 * Alan Jones 2025 road-running open standards and single-age factors.
 *
 * Generated from the Age Facctors worksheets of MaleRoadStd2025.xlsx and
 * FemaleRoadStd2025.xlsx in:
 * https://github.com/AlanLyttonJones/Age-Grade-Tables/tree/master/2025%20Files
 *
 * Source SHA-256:
 *   male:   ${checksum(malePath)}
 *   female: ${checksum(femalePath)}
 *
 * The source repository is licensed CC0-1.0. RunBundle uses these tables for
 * road results. Do not replace factors with the workbooks' rounded AgeStanSec
 * cells: RunBundle derives each age standard as open standard / age factor.
 *
 * This file is generated by scripts/generate-age-grade-tables.ts.
 * DO NOT EDIT BY HAND.
 */

/** Distances, in metres, in the order used by every row below. */
export const AGE_FACTOR_DISTANCES_METRES = ${JSON.stringify(REFERENCE_DISTANCES)} as const;

export type AgeFactorRow = readonly [
  fiveKm: number,
  sixKm: number,
  fourMiles: number,
  eightKm: number,
];

export const MIN_TABLE_AGE = 5;
export const MAX_TABLE_AGE = 100;

export const MALE_OPEN_CLASS_STANDARDS_2025: AgeFactorRow = [${male.openClassStandards.join(', ')}];
export const FEMALE_OPEN_CLASS_STANDARDS_2025: AgeFactorRow = [${female.openClassStandards.join(', ')}];

${factorRows('MALE_ROAD_FACTORS_2025', male.factors)}

${factorRows('FEMALE_ROAD_FACTORS_2025', female.factors)}
`;
}

const positional = process.argv.slice(2).filter((argument) => argument !== '--stdout');
if (positional.length !== 2) {
  throw new Error(
    'Usage: generate-age-grade-tables.ts <MaleRoadStd2025.xlsx> <FemaleRoadStd2025.xlsx> [--stdout]',
  );
}

const source = moduleSource(resolve(positional[0]!), resolve(positional[1]!));
if (process.argv.includes('--stdout')) {
  process.stdout.write(source);
} else {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const destination = resolve(here, '../src/domain/scoring/age-grade/data/alan-jones-road-2025.ts');
  writeFileSync(destination, source);
  process.stdout.write(`Generated ${destination}\n`);
}
