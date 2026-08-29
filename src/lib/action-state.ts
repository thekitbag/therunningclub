/**
 * Form state shared between server actions and the client components that
 * render them.
 *
 * This module exists to keep a hard line between the two worlds. Client
 * components need `ActionState` and `IDLE`, and importing them from
 * `src/lib/actions.ts` would pull the session and database modules — and with
 * them the whole Prisma client — into the browser bundle. Nothing here may
 * import anything server-side.
 */

export interface ActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** Correlation id shown to the user when something unexpected went wrong. */
  readonly reference?: string;
}

export const IDLE: ActionState = { status: 'idle' };
