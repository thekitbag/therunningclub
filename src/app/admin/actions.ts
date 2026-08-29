'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import {
  assertRequestIntegrity,
  guardMutation,
  rethrowIfFrameworkSignal,
  toActionState,
  type ActionState,
} from '@/lib/actions';
import { clearSessionCookie, getCurrentActor, setSessionCookie } from '@/lib/session';
import {
  completePasswordReset,
  createAdministrator,
  issuePasswordReset,
  setAdministratorStatus,
  signIn,
  signOut,
} from '@/services/administrators';
import {
  createRunner,
  deactivateRunner,
  mergeRunnersAndRecalculate,
  updateRunner,
} from '@/services/runners';
import {
  createRound,
  createSeason,
  publishRound,
  saveRoundResults,
  setSeasonState,
  unpublishRound,
  updateRound,
} from '@/services/time-trials';
import { createRace, setRaceState, updateRace } from '@/services/races';
import { saveRaceResults, setChampionshipState } from '@/services/championships';

/**
 * Server actions for the admin console.
 *
 * Each one follows the same shape: guard the request, call a service, revalidate
 * the affected paths, return an `ActionState`. Business rules live in the
 * services so they can be tested without a request context, and so a second
 * caller cannot bypass them.
 */

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
};

const checkbox = (formData: FormData, key: string): boolean => formData.get(key) === 'on';

// ---------------------------------------------------------------- sign in/out

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination = '/admin';
  try {
    await assertRequestIntegrity(formData);

    const requestHeaders = await headers();
    const result = await signIn(
      { email: text(formData, 'email'), password: text(formData, 'password') },
      {
        // Rate limiting keys on the submitted address rather than an IP, which
        // a single-instance club site cannot see reliably behind a proxy.
        rateLimitKey: text(formData, 'email').trim().toLowerCase(),
        clientSummary: requestHeaders.get('user-agent')?.slice(0, 120) ?? undefined,
      },
    );

    // A fresh cookie on every sign-in rotates the session identifier, so a
    // token captured before authentication cannot be reused after it.
    await setSessionCookie(result.token, result.expiresAt);

    const next = text(formData, 'next');
    if (next.startsWith('/admin')) destination = next;
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/sign-in');
  }
  redirect(destination);
}

export async function signOutAction(formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
    const actor = await getCurrentActor();
    if (actor) await signOut(actor);
  } catch {
    // Signing out must always succeed from the user's point of view; the
    // cookie is cleared regardless.
  }
  await clearSessionCookie();
  redirect('/admin/sign-in');
}

export async function completeResetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRequestIntegrity(formData);
    const password = text(formData, 'password');
    if (password !== text(formData, 'passwordConfirmation')) {
      return {
        status: 'error',
        message: 'Check the password.',
        fieldErrors: { passwordConfirmation: 'The two passwords do not match.' },
      };
    }
    await completePasswordReset(text(formData, 'token'), password);
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/reset');
  }
  redirect('/admin/sign-in?reset=done');
}

// ------------------------------------------------------------------- runners

export async function createRunnerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await createRunner({
      givenName: text(formData, 'givenName'),
      familyName: text(formData, 'familyName'),
      dateOfBirth: text(formData, 'dateOfBirth'),
      category: text(formData, 'category') as 'MALE' | 'FEMALE',
      status: 'ACTIVE',
    });
    revalidatePath('/admin/runners');
    return { status: 'success', message: 'Runner created.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/runners');
  }
}

export async function updateRunnerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await updateRunner(text(formData, 'runnerId'), {
      givenName: text(formData, 'givenName'),
      familyName: text(formData, 'familyName'),
      dateOfBirth: text(formData, 'dateOfBirth'),
      category: text(formData, 'category') as 'MALE' | 'FEMALE',
      status: text(formData, 'status') as 'ACTIVE' | 'INACTIVE',
    });
    revalidatePath('/admin/runners');
    revalidatePathsForPublicResults();
    return { status: 'success', message: 'Runner updated.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/runners');
  }
}

export async function deactivateRunnerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await deactivateRunner(text(formData, 'runnerId'));
    revalidatePath('/admin/runners');
    return { status: 'success', message: 'Runner deactivated. Their results are unchanged.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/runners');
  }
}

export async function mergeRunnersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    const outcome = await mergeRunnersAndRecalculate(
      text(formData, 'duplicateId'),
      text(formData, 'survivingId'),
    );
    revalidatePath('/admin/runners');
    revalidatePathsForPublicResults();

    const skipped = outcome.skippedTimeTrialResults + outcome.skippedChampionshipResults;
    return {
      status: 'success',
      message:
        `Merged. Moved ${outcome.movedTimeTrialResults} time-trial and ` +
        `${outcome.movedChampionshipResults} championship result(s).` +
        (skipped > 0
          ? ` ${skipped} result(s) stayed with the old record because the surviving runner already had a result in the same round or race.`
          : ''),
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/runners');
  }
}

// --------------------------------------------------------------- time trials

export async function createSeasonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await createSeason({
      name: text(formData, 'name'),
      type: text(formData, 'type') as 'SUMMER' | 'WINTER',
      startDate: text(formData, 'startDate'),
      endDate: text(formData, 'endDate'),
    });
    revalidatePath('/admin/time-trials');
    return { status: 'success', message: 'Season created.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

export async function setSeasonStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await setSeasonState(
      text(formData, 'seasonId'),
      text(formData, 'state') as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    );
    revalidatePath('/admin/time-trials');
    revalidatePathsForPublicResults();
    return { status: 'success', message: 'Season updated.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

export async function createRoundAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await createRound(text(formData, 'seasonId'), {
      name: text(formData, 'name'),
      date: text(formData, 'date'),
      ordinal: text(formData, 'ordinal'),
    });
    revalidatePath(`/admin/time-trials/${text(formData, 'seasonId')}`);
    return { status: 'success', message: 'Round added.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

export async function updateRoundAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await updateRound(text(formData, 'roundId'), {
      name: text(formData, 'name'),
      date: text(formData, 'date'),
      ordinal: text(formData, 'ordinal'),
    });
    revalidatePath('/admin/time-trials');
    revalidatePathsForPublicResults();
    return {
      status: 'success',
      message: 'Round updated and the whole season recalculated.',
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

/**
 * Saves a whole round of results.
 *
 * The form posts parallel arrays, one entry per row, which is what a repeated
 * fieldset produces naturally and keeps the markup progressive-enhancement
 * friendly: the grid works without JavaScript.
 */
export async function saveRoundResultsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);

    const runnerIds = formData.getAll('runnerId').map(String);
    const distances = formData.getAll('distanceChoice').map(String);
    const times = formData.getAll('time').map(String);

    const entries = runnerIds
      .map((runnerId, index) => ({
        runnerId,
        distanceChoice: (distances[index] ?? 'TWO_LAP') as 'TWO_LAP' | 'THREE_LAP',
        time: times[index] ?? '',
      }))
      // Blank rows are how an operator leaves spare lines in the grid unused.
      .filter((entry) => entry.runnerId !== '' && entry.time.trim() !== '');

    await saveRoundResults(text(formData, 'roundId'), entries);
    revalidatePath('/admin/time-trials');
    revalidatePathsForPublicResults();

    return {
      status: 'success',
      message: `Saved ${entries.length} result(s). Scores below are recalculated from these times.`,
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

export async function publishRoundAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await publishRound(text(formData, 'roundId'));
    revalidatePath('/admin/time-trials');
    revalidatePathsForPublicResults();
    return { status: 'success', message: 'Round published and now visible to the public.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

export async function unpublishRoundAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await unpublishRound(text(formData, 'roundId'));
    revalidatePath('/admin/time-trials');
    revalidatePathsForPublicResults();
    return {
      status: 'success',
      message: 'Round unpublished and removed from public standings.',
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/time-trials');
  }
}

// ---------------------------------------------------------------------- races

function raceInputFrom(formData: FormData) {
  return {
    name: text(formData, 'name'),
    shortLabel: text(formData, 'shortLabel'),
    date: text(formData, 'date'),
    startTime: text(formData, 'startTime'),
    locationName: text(formData, 'locationName'),
    address: text(formData, 'address'),
    mapUrl: text(formData, 'mapUrl'),
    distanceLabel: text(formData, 'distanceLabel'),
    distanceMetres: text(formData, 'distanceMetres') || null,
    leagueName: text(formData, 'leagueName'),
    entryInstructions: text(formData, 'entryInstructions'),
    externalUrl: text(formData, 'externalUrl'),
    status: text(formData, 'status') as 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED',
    isChampionshipQualifier: checkbox(formData, 'isChampionshipQualifier'),
  };
}

export async function createRaceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await createRace(raceInputFrom(formData));
    revalidatePath('/admin/races');
    revalidatePath('/races');
    return { status: 'success', message: 'Race created as a draft.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/races');
  }
}

export async function updateRaceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await updateRace(text(formData, 'raceId'), raceInputFrom(formData));
    revalidatePath('/admin/races');
    revalidatePath('/races');
    revalidatePath('/club-championship', 'layout');
    return { status: 'success', message: 'Race updated.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/races');
  }
}

export async function setRaceStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await setRaceState(text(formData, 'raceId'), text(formData, 'state') as 'DRAFT' | 'PUBLISHED');
    revalidatePath('/admin/races');
    revalidatePath('/races');
    revalidatePath('/club-championship', 'layout');
    revalidatePath('/');
    return { status: 'success', message: 'Race publication updated.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/races');
  }
}

// -------------------------------------------------------------- championships

export async function saveRaceResultsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);

    const runnerIds = formData.getAll('runnerId').map(String);
    const positions = formData.getAll('categoryPosition').map(String);

    const entries = runnerIds
      .map((runnerId, index) => ({ runnerId, categoryPosition: positions[index] ?? '' }))
      .filter((entry) => entry.runnerId !== '' && String(entry.categoryPosition).trim() !== '');

    await saveRaceResults(text(formData, 'raceId'), entries);
    revalidatePath('/admin/championships');
    revalidatePath('/admin/races');
    revalidatePath('/club-championship', 'layout');
    revalidatePath('/');
    return { status: 'success', message: `Saved ${entries.length} club placing(s).` };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/championships');
  }
}

export async function setChampionshipStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    await setChampionshipState(
      text(formData, 'championshipId'),
      text(formData, 'state') as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    );
    revalidatePath('/admin/championships');
    revalidatePath('/club-championship', 'layout');
    revalidatePath('/');
    return { status: 'success', message: 'Championship updated.' };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/championships');
  }
}

// ------------------------------------------------------------- administrators

export async function createAdministratorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    const created = await createAdministrator({
      email: text(formData, 'email'),
      displayName: text(formData, 'displayName'),
      password: text(formData, 'password'),
    });
    revalidatePath('/admin/administrators');
    return {
      status: 'success',
      message: `Created ${created.displayName}. Pass the password on securely and ask them to change it.`,
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/administrators');
  }
}

export async function setAdministratorStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    const updated = await setAdministratorStatus(
      text(formData, 'administratorId'),
      text(formData, 'status') as 'ACTIVE' | 'DISABLED',
    );
    revalidatePath('/admin/administrators');
    return {
      status: 'success',
      message:
        updated.status === 'DISABLED'
          ? `${updated.displayName} is disabled and every session they held has been revoked.`
          : `${updated.displayName} is active again.`,
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/administrators');
  }
}

export async function issueResetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await guardMutation(formData);
    const reset = await issuePasswordReset(text(formData, 'administratorId'));
    revalidatePath('/admin/administrators');
    return {
      status: 'success',
      // The link is shown once and never stored in readable form. The issuing
      // administrator passes it on out of band, which is v1's deliberate
      // substitute for email delivery.
      message: `RESET_LINK:/admin/reset?token=${reset.token}`,
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    return toActionState(error, '/admin/administrators');
  }
}

function revalidatePathsForPublicResults(): void {
  revalidatePath('/');
  revalidatePath('/time-trial', 'layout');
  revalidatePath('/club-championship', 'layout');
}
