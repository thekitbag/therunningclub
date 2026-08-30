'use client';

import { useActionState } from 'react';
import {
  createAdministratorAction,
  issueResetAction,
  setAdministratorStatusAction,
} from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import { MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { ScrollableTable } from '@/components/ScrollableTable';

interface AdministratorSummary {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
  activeSessions: number;
  lastSignedInAt: string | null;
}

export function AdministratorForms({
  administrators,
  currentActorId,
  csrfCreate,
  csrfStatus,
  csrfReset,
}: {
  administrators: readonly AdministratorSummary[];
  currentActorId: string;
  csrfCreate: React.ReactNode;
  csrfStatus: React.ReactNode;
  csrfReset: React.ReactNode;
}) {
  const [createState, createAction, creating] = useActionState(createAdministratorAction, IDLE);
  const [statusState, statusAction, updatingStatus] = useActionState(
    setAdministratorStatusAction,
    IDLE,
  );
  const [resetState, resetAction, issuing] = useActionState(issueResetAction, IDLE);

  // The reset link is returned once and never stored anywhere readable, so it
  // is rendered here for the issuing administrator to copy and pass on.
  const resetLink =
    resetState.status === 'success' && resetState.message?.startsWith('RESET_LINK:')
      ? resetState.message.slice('RESET_LINK:'.length)
      : null;

  return (
    <div className="stack-lg">
      <section aria-labelledby="admin-list">
        <div className="section-head">
          <h2 id="admin-list">Accounts</h2>
        </div>
        <ScrollableTable label="Administrator accounts">
          <table>
            <caption>
              Disabling an account revokes every session it holds immediately, on every device.
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Active sessions
                </th>
                <th scope="col">Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {administrators.map((administrator) => (
                <tr key={administrator.id}>
                  <th scope="row">
                    {administrator.displayName}
                    {administrator.id === currentActorId ? (
                      <span className="tag" style={{ marginLeft: '0.5rem' }}>
                        You
                      </span>
                    ) : null}
                  </th>
                  <td>{administrator.email}</td>
                  <td>
                    <span
                      className={`tag${administrator.status === 'ACTIVE' ? ' tag--green' : ' tag--danger'}`}
                    >
                      {administrator.status === 'ACTIVE' ? '✓ Active' : '✕ Disabled'}
                    </span>
                  </td>
                  <td className="num">{administrator.activeSessions}</td>
                  <td className="nowrap">{administrator.lastSignedInAt ?? 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>

      <section aria-labelledby="add-admin">
        <div className="section-head">
          <h2 id="add-admin">Add an administrator</h2>
        </div>
        <form action={createAction} className="card stack">
          {csrfCreate}
          <FormFeedback state={createState} />

          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor="admin-displayName">Name</label>
              <input id="admin-displayName" name="displayName" required />
              <FieldError id="displayName-error" message={createState.fieldErrors?.displayName} />
            </div>
            <div className="field">
              <label htmlFor="admin-email">Email address</label>
              <input id="admin-email" name="email" type="email" required autoComplete="off" />
              <FieldError id="admin-email-error" message={createState.fieldErrors?.email} />
            </div>
            <div className="field form-grid__full">
              <label htmlFor="admin-password">Initial password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-describedby="admin-password-hint"
              />
              <p className="field__hint" id="admin-password-hint">
                At least {MINIMUM_PASSWORD_LENGTH} characters. Give it to them in person or over a
                channel you trust, and ask them to change it once they are in.
              </p>
              <FieldError id="admin-password-error" message={createState.fieldErrors?.password} />
            </div>
          </div>

          <div className="btn-row">
            <SubmitButton pending={creating}>Create administrator</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="admin-status">
        <div className="section-head">
          <h2 id="admin-status">Enable or disable an account</h2>
        </div>
        <form action={statusAction} className="card stack">
          {csrfStatus}
          <FormFeedback state={statusState} />
          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor="status-admin">Administrator</label>
              <select id="status-admin" name="administratorId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {administrators
                  .filter((administrator) => administrator.id !== currentActorId)
                  .map((administrator) => (
                    <option key={administrator.id} value={administrator.id}>
                      {administrator.displayName} ({administrator.status.toLowerCase()})
                    </option>
                  ))}
              </select>
              <p className="field__hint">
                You cannot disable your own account, and at least one account must stay active.
              </p>
            </div>
            <div className="field">
              <label htmlFor="status-value">Set to</label>
              <select id="status-value" name="status" defaultValue="DISABLED">
                <option value="DISABLED">Disabled — signs them out everywhere</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
          </div>
          <div className="btn-row">
            <SubmitButton pending={updatingStatus} variant="danger">
              Update account
            </SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="admin-reset">
        <div className="section-head">
          <h2 id="admin-reset">Issue a password reset link</h2>
        </div>
        <form action={resetAction} className="card stack">
          {csrfReset}
          {resetState.status === 'error' ? <FormFeedback state={resetState} /> : null}

          <p className="muted">
            There is no reset email in v1. Generate a link here and give it to the person directly.
            It works once and expires in an hour.
          </p>

          <div className="field" style={{ maxWidth: '24rem' }}>
            <label htmlFor="reset-admin">Administrator</label>
            <select id="reset-admin" name="administratorId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {administrators.map((administrator) => (
                <option key={administrator.id} value={administrator.id}>
                  {administrator.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="btn-row">
            <SubmitButton pending={issuing}>Generate reset link</SubmitButton>
          </div>

          {resetLink ? (
            <div className="notice notice--info" role="status">
              <p className="notice__title">Reset link generated</p>
              <p>Copy this now — it is not shown again and is not stored anywhere readable.</p>
              <p className="token-box">{resetLink}</p>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
