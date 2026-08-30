'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config';
import { isSameOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { SIGN_IN_RULE, consumeRateLimit, resetRateLimit } from '@/lib/rate-limit';
import {
  ACCESS_COOKIE_NAME,
  ACCESS_TTL_MS,
  issueAccessToken,
  passcodeMatches,
} from '@/lib/site-access';
import type { ActionState } from '@/lib/action-state';

/**
 * Accepts the club passcode and unlocks the device.
 *
 * A single shared passcode is inherently guessable at scale, so this is rate
 * limited hard — harder than an individual account would need to be, because
 * there is only one secret to find. The limit is keyed on the origin rather
 * than a user, since there is no user to key on.
 */
export async function unlockAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination = '/';

  try {
    const requestHeaders = await headers();
    if (!isSameOrigin(requestHeaders)) {
      return { status: 'error', message: 'That request did not come from this site.' };
    }

    const config = getConfig();
    if (!config.siteIsGated) redirect('/');

    // One shared secret means one bucket. 10 attempts per 15 minutes is
    // generous for someone mistyping and hopeless for someone guessing.
    const limit = consumeRateLimit('site-passcode', SIGN_IN_RULE);
    if (!limit.allowed) {
      return {
        status: 'error',
        message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
      };
    }

    const submitted = formData.get('passcode');
    if (typeof submitted !== 'string' || !passcodeMatches(submitted, config.sitePasscode)) {
      logger.warn('Incorrect club passcode submitted');
      return {
        status: 'error',
        message: 'That passcode was not recognised. Check with a club committee member.',
      };
    }

    resetRateLimit('site-passcode');

    const token = await issueAccessToken(config.sitePasscode, config.sessionSecret);
    const store = await cookies();
    store.set(ACCESS_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: new Date(Date.now() + ACCESS_TTL_MS),
    });

    const next = formData.get('next');
    // Only ever a path on this site, so the passcode form cannot be turned into
    // an open redirect that bounces members somewhere else.
    if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
      destination = next;
    }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      typeof (error as { digest: unknown }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    logger.error('Unlock failed', { error });
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }

  redirect(destination);
}

/** Locks this device again, for a shared or borrowed computer. */
export async function lockAction(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE_NAME);
  redirect('/unlock');
}
