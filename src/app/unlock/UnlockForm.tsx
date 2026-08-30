'use client';

import { useActionState } from 'react';
import { unlockAction } from './actions';
import { IDLE } from '@/lib/action-state';

export function UnlockForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(unlockAction, IDLE);

  return (
    <form action={formAction} className="card stack">
      <input type="hidden" name="next" value={next} />

      {state.status === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="form-feedback">
          <p>{state.message}</p>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="passcode">Club passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-describedby="passcode-hint"
          aria-invalid={state.status === 'error' ? true : undefined}
        />
        <p className="field__hint" id="passcode-hint">
          One passcode for the whole club. You should only need to enter it once on this device.
        </p>
      </div>

      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </div>
    </form>
  );
}
