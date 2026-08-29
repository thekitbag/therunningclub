'use client';

import { useActionState } from 'react';
import { completeResetAction } from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import { MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';

export function ResetForm({ token, csrfField }: { token: string; csrfField: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(completeResetAction, IDLE);

  return (
    <form action={formAction} className="card stack">
      {csrfField}
      <input type="hidden" name="token" value={token} />

      <FormFeedback state={state} />

      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MINIMUM_PASSWORD_LENGTH}
          aria-describedby="password-hint password-error"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
        <p className="field__hint" id="password-hint">
          At least {MINIMUM_PASSWORD_LENGTH} characters. A memorable phrase of three or four words
          is both stronger and easier to type than a short complicated password.
        </p>
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="field">
        <label htmlFor="passwordConfirmation">Confirm new password</label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={state.fieldErrors?.passwordConfirmation ? 'confirm-error' : undefined}
          aria-invalid={state.fieldErrors?.passwordConfirmation ? true : undefined}
        />
        <FieldError id="confirm-error" message={state.fieldErrors?.passwordConfirmation} />
      </div>

      <div className="btn-row">
        <SubmitButton pending={pending}>Set password</SubmitButton>
      </div>

      <p className="muted">Changing your password signs you out everywhere, on every device.</p>
    </form>
  );
}
