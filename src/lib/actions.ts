import 'server-only';
import { headers } from 'next/headers';
import {
  ANONYMOUS_BINDING,
  CSRF_FIELD_NAME,
  issueCsrfToken,
  isSameOrigin,
  verifyCsrfToken,
} from './csrf';
import { getCurrentActor, type AdminActor } from './session';
import { AuthorizationError } from './authz';
import { logger, newCorrelationId } from './logger';
import { ServiceError } from '@/services/errors';
import { IDLE, type ActionState } from './action-state';

/**
 * Shared plumbing for admin server actions.
 *
 * Every mutation goes through `guardMutation`, which performs three checks in
 * order: same-origin, CSRF token, and authorisation. Doing all three in one
 * helper is what makes it hard to add a new action that forgets one — and the
 * authorisation check is repeated inside each service too, because a server
 * action can be invoked by identifier without any page ever rendering.
 */

export { IDLE };
export type { ActionState };

/**
 * Issues a CSRF token bound to the caller's session.
 *
 * Pure with respect to the response: it writes no cookie and sets no header,
 * which is what lets it be called while a server component renders. Anonymous
 * callers — the sign-in form — bind to a fixed marker instead; an attacker
 * still cannot forge one, because the signature requires the application secret.
 */
export async function getCsrfToken(): Promise<string> {
  const actor = await getCurrentActor();
  return issueCsrfToken(actor?.sessionId ?? ANONYMOUS_BINDING);
}

/** Runs the same-origin and CSRF checks without requiring a session. */
export async function assertRequestIntegrity(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    throw new ServiceError('FORBIDDEN', 'That request did not come from this site.');
  }

  const actor = await getCurrentActor();
  const binding = actor?.sessionId ?? ANONYMOUS_BINDING;
  const submitted = formData.get(CSRF_FIELD_NAME);

  if (typeof submitted !== 'string' || !verifyCsrfToken(submitted, binding)) {
    throw new ServiceError('FORBIDDEN', 'This form has expired. Reload the page and try again.');
  }
}

/** Full guard for an authenticated mutation. Returns the acting administrator. */
export async function guardMutation(formData: FormData): Promise<AdminActor> {
  await assertRequestIntegrity(formData);
  const actor = await getCurrentActor();
  if (!actor) throw new AuthorizationError();
  return actor;
}

/**
 * Converts a thrown error into an `ActionState` a form can render.
 *
 * Known service errors surface their own message and field errors. Anything
 * else becomes a generic message plus a correlation id, with the real detail
 * logged server-side — a stack trace must never reach an admin's browser.
 */
export function toActionState(error: unknown, route: string): ActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }
  if (error instanceof AuthorizationError) {
    return { status: 'error', message: error.message };
  }

  const reference = newCorrelationId();
  logger.error('Unhandled admin action failure', { route, requestId: reference, error });
  return {
    status: 'error',
    message: 'Something went wrong saving that. Please try again.',
    reference,
  };
}

/**
 * Re-throws Next.js control-flow signals.
 *
 * `redirect()` and `notFound()` work by throwing, so a broad catch around an
 * action body would swallow them and turn a successful redirect into an error
 * banner. Every action calls this first inside its catch.
 */
export function rethrowIfFrameworkSignal(error: unknown): void {
  if (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    ((error as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (error as { digest: string }).digest === 'NEXT_NOT_FOUND')
  ) {
    throw error;
  }
}
