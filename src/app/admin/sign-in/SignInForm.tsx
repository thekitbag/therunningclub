'use client';

import { useActionState } from 'react';
import { signInAction } from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

/**
 * Sign-in form.
 *
 * The failure message is deliberately identical for a wrong password, a
 * non-existent address and a disabled account, so this form cannot be used to
 * work out who the club's administrators are.
 */
export function SignInForm({ next, csrfField }: { next: string; csrfField: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE);

  return (
    <form action={formAction} className="card stack">
      {csrfField}
      <input type="hidden" name="next" value={next} />

      <FormFeedback state={state} />

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="btn-row">
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </div>

      <p className="muted">
        Forgotten your password? Ask another administrator to issue you a reset link.
      </p>
    </form>
  );
}
