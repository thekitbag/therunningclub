import { redirect } from 'next/navigation';
import { getCurrentActor, type AdminActor } from './session';

/**
 * Authorisation helpers.
 *
 * Every server command calls one of these itself rather than trusting that some
 * layout or middleware already checked. Middleware alone is not sufficient: a
 * server action can be invoked directly by its identifier, bypassing whatever
 * page rendered the form.
 */

export class AuthorizationError extends Error {
  constructor(message = 'You must be signed in as an administrator to do that.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Returns the actor or throws. Use inside services and server actions. */
export async function requireActor(): Promise<AdminActor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthorizationError();
  return actor;
}

/** Returns the actor or redirects to sign-in. Use at the top of admin pages. */
export async function requireActorOrRedirect(returnTo?: string): Promise<AdminActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    const target = returnTo
      ? `/admin/sign-in?next=${encodeURIComponent(returnTo)}`
      : '/admin/sign-in';
    redirect(target);
  }
  return actor;
}
