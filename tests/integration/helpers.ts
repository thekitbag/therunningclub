import { vi } from 'vitest';
import { prisma } from '@/lib/db';
import { hashPassword, storedParametersToJson } from '@/lib/password';
import { createSession, type AdminActor } from '@/lib/session';
import {
  AGE_GRADE_VERSION,
  SCORING_RULES_VERSION,
  SEASON_DISTANCES,
  parseElapsedTime,
} from '@/domain/scoring';

/**
 * Test helpers.
 *
 * Services call `requireActor()`, which reads the session cookie through
 * `next/headers`. Integration tests have no request context, so the cookie
 * store is mocked at module level and `signInAs` simply points it at a real
 * session row — the authorisation path itself is exercised for real.
 */

export const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let currentCookies = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = currentCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      currentCookies.set(name, value);
    },
    delete: (name: string) => {
      currentCookies.delete(name);
    },
  }),
  headers: async () => new Headers({ origin: process.env.APP_ORIGIN ?? '' }),
}));

export function clearCookies(): void {
  currentCookies = new Map();
}

export function setCookie(name: string, value: string): void {
  currentCookies.set(name, value);
}

export async function createAdmin(
  email = 'admin@example.invalid',
  password = 'a-long-enough-test-password',
  displayName = 'Test Admin',
) {
  const stored = await hashPassword(password);
  return prisma.administrator.create({
    data: {
      email: email.toLowerCase(),
      displayName,
      passwordHash: stored.hash,
      passwordParameters: storedParametersToJson(stored.parameters),
    },
  });
}

/** Creates a real session row and installs its token as the current cookie. */
export async function signInAs(administratorId: string): Promise<AdminActor> {
  const session = await createSession(administratorId, 'integration test');
  setCookie('rmpac_session', session.token);
  return {
    id: administratorId,
    email: '',
    displayName: '',
    sessionId: session.sessionId,
  };
}

export async function createRunnerRecord(input: {
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  category: 'MALE' | 'FEMALE';
}) {
  return prisma.runner.create({
    data: {
      givenName: input.givenName,
      familyName: input.familyName,
      searchName: `${input.givenName} ${input.familyName}`.toLowerCase(),
      dateOfBirth: utc(input.dateOfBirth),
      category: input.category,
    },
  });
}

export async function createWinterSeason(
  name = 'Winter 2025/26',
  state: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
) {
  return prisma.ttSeason.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      type: 'WINTER',
      startDate: utc('2025-10-01'),
      endDate: utc('2026-03-31'),
      clubYearLabel: '2025/26',
      twoLapMetres: SEASON_DISTANCES.WINTER.TWO_LAP,
      threeLapMetres: SEASON_DISTANCES.WINTER.THREE_LAP,
      state,
      scoringRulesVersion: SCORING_RULES_VERSION,
      ageGradeVersion: AGE_GRADE_VERSION,
    },
  });
}

export async function createRound(
  seasonId: string,
  ordinal: number,
  date: string,
  state: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
) {
  return prisma.ttRound.create({
    data: {
      seasonId,
      ordinal,
      name: `Round ${ordinal}`,
      date: utc(date),
      state,
      publishedAt: state === 'PUBLISHED' ? new Date() : null,
    },
  });
}

export async function addResult(
  roundId: string,
  runnerId: string,
  time: string,
  distanceChoice: 'TWO_LAP' | 'THREE_LAP' = 'TWO_LAP',
) {
  return prisma.ttResult.create({
    data: {
      roundId,
      runnerId,
      distanceChoice,
      distanceMetres: SEASON_DISTANCES.WINTER[distanceChoice],
      elapsedMilliseconds: parseElapsedTime(time),
      finishingPosition: 0,
      finishingPoints: 0,
      scoringRulesVersion: SCORING_RULES_VERSION,
      ageGradeVersion: AGE_GRADE_VERSION,
    },
  });
}
