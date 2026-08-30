'use client';

import type { ActionState } from '@/lib/action-state';

/**
 * Form-level status message.
 *
 * Uses `role="alert"` for failures so screen readers announce them
 * immediately, and `role="status"` for successes so they are announced
 * politely without interrupting.
 */
export function FormFeedback({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;

  const isError = state.status === 'error';
  return (
    <div
      className={`notice ${isError ? 'notice--error' : 'notice--info'}`}
      role={isError ? 'alert' : 'status'}
      data-testid="form-feedback"
    >
      <p className="notice__title">{isError ? 'Could not save' : 'Saved'}</p>
      {state.message ? <p>{state.message}</p> : null}
      {state.reference ? (
        <p className="muted">
          Reference <code>{state.reference}</code>
        </p>
      ) : null}
    </div>
  );
}

/** Field-level error, wired to the input through `aria-describedby`. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field__error" id={id}>
      {message}
    </p>
  );
}

/** Submit button that disables itself and announces progress while pending. */
export function SubmitButton({
  children,
  pending,
  variant = 'primary',
}: {
  children: React.ReactNode;
  pending: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <button type="submit" className={`btn btn--${variant}`} disabled={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}
