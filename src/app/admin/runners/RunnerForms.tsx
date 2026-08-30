'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  createRunnerAction,
  deactivateRunnerAction,
  mergeRunnersAction,
  updateRunnerAction,
} from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import type { RunnerListItem } from '@/services/runners';
import { ScrollableTable } from '@/components/ScrollableTable';

interface EditableRunner {
  id: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  category: 'MALE' | 'FEMALE';
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Runner create, edit and merge.
 *
 * Duplicate detection runs in the browser against the already-loaded roster as
 * the operator types, so they see a warning before submitting rather than after
 * creating a second record for the same person. The authoritative check still
 * lives on the server.
 */
export function RunnerForms({
  runners,
  editable,
  csrfField,
  csrfFieldEdit,
  csrfFieldMerge,
}: {
  runners: readonly RunnerListItem[];
  editable: readonly EditableRunner[];
  csrfField: React.ReactNode;
  csrfFieldEdit: React.ReactNode;
  csrfFieldMerge: React.ReactNode;
}) {
  const [createState, createFormAction, creating] = useActionState(createRunnerAction, IDLE);
  const [editState, editFormAction, editing] = useActionState(updateRunnerAction, IDLE);
  const [mergeState, mergeFormAction, merging] = useActionState(mergeRunnersAction, IDLE);
  const [deactivateState, deactivateFormAction, deactivating] = useActionState(
    deactivateRunnerAction,
    IDLE,
  );

  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const normalise = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const possibleDuplicates = useMemo(() => {
    const candidate = normalise(`${givenName} ${familyName}`);
    if (candidate.length < 3) return [];
    return runners.filter((runner) => normalise(runner.displayName) === candidate);
  }, [givenName, familyName, runners]);

  const selected = editable.find((runner) => runner.id === selectedId);

  return (
    <div className="stack-lg">
      <section aria-labelledby="add-runner">
        <div className="section-head">
          <h2 id="add-runner">Add a runner</h2>
        </div>
        <form action={createFormAction} className="card stack">
          {csrfField}
          <FormFeedback state={createState} />

          {possibleDuplicates.length > 0 ? (
            <div className="notice notice--warn" role="status">
              <p className="notice__title">Possible duplicate</p>
              <p>
                {possibleDuplicates.length === 1
                  ? 'A runner'
                  : `${possibleDuplicates.length} runners`}{' '}
                already {possibleDuplicates.length === 1 ? 'has' : 'have'} this name:{' '}
                {possibleDuplicates.map((runner) => runner.displayName).join(', ')}. Check before
                adding another — if this is the same person, edit the existing record instead.
              </p>
            </div>
          ) : null}

          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor="givenName">First name</label>
              <input
                id="givenName"
                name="givenName"
                required
                value={givenName}
                onChange={(event) => setGivenName(event.target.value)}
                aria-invalid={createState.fieldErrors?.givenName ? true : undefined}
                aria-describedby={
                  createState.fieldErrors?.givenName ? 'givenName-error' : undefined
                }
              />
              <FieldError id="givenName-error" message={createState.fieldErrors?.givenName} />
            </div>

            <div className="field">
              <label htmlFor="familyName">Last name</label>
              <input
                id="familyName"
                name="familyName"
                required
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                aria-invalid={createState.fieldErrors?.familyName ? true : undefined}
                aria-describedby={
                  createState.fieldErrors?.familyName ? 'familyName-error' : undefined
                }
              />
              <FieldError id="familyName-error" message={createState.fieldErrors?.familyName} />
            </div>

            <div className="field">
              <label htmlFor="dateOfBirth">Date of birth</label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                aria-describedby="dob-hint dateOfBirth-error"
                aria-invalid={createState.fieldErrors?.dateOfBirth ? true : undefined}
              />
              <p className="field__hint" id="dob-hint">
                Private. Used only for age grading.
              </p>
              <FieldError id="dateOfBirth-error" message={createState.fieldErrors?.dateOfBirth} />
            </div>

            <div className="field">
              <label htmlFor="category">Scoring category</label>
              <select id="category" name="category" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
              <p className="field__hint">
                Determines which age-grade standard applies and which table they appear in.
              </p>
            </div>
          </div>

          <div className="btn-row">
            <SubmitButton pending={creating}>Add runner</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="edit-runner">
        <div className="section-head">
          <h2 id="edit-runner">Edit a runner</h2>
        </div>
        <div className="card stack">
          <div className="field">
            <label htmlFor="runnerSelect">Choose a runner</label>
            <select
              id="runnerSelect"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Choose…</option>
              {editable.map((runner) => (
                <option key={runner.id} value={runner.id}>
                  {runner.familyName}, {runner.givenName}
                </option>
              ))}
            </select>
          </div>

          {selected ? (
            <>
              <form action={editFormAction} className="stack" key={selected.id}>
                {csrfFieldEdit}
                <input type="hidden" name="runnerId" value={selected.id} />
                <FormFeedback state={editState} />

                <div className="notice notice--warn">
                  <p>
                    Changing a date of birth or scoring category changes every age grade that runner
                    has ever scored, and can change improvement points in later rounds. The affected
                    seasons are recalculated automatically when you save.
                  </p>
                </div>

                <div className="form-grid form-grid--2">
                  <div className="field">
                    <label htmlFor="edit-givenName">First name</label>
                    <input
                      id="edit-givenName"
                      name="givenName"
                      required
                      defaultValue={selected.givenName}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-familyName">Last name</label>
                    <input
                      id="edit-familyName"
                      name="familyName"
                      required
                      defaultValue={selected.familyName}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-dateOfBirth">Date of birth</label>
                    <input
                      id="edit-dateOfBirth"
                      name="dateOfBirth"
                      type="date"
                      required
                      defaultValue={selected.dateOfBirth}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-category">Scoring category</label>
                    <select id="edit-category" name="category" defaultValue={selected.category}>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-status">Status</label>
                    <select id="edit-status" name="status" defaultValue={selected.status}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="btn-row">
                  <SubmitButton pending={editing}>Save changes</SubmitButton>
                </div>
              </form>

              <form action={deactivateFormAction} className="stack">
                {csrfFieldMerge}
                <input type="hidden" name="runnerId" value={selected.id} />
                <FormFeedback state={deactivateState} />
                <div className="btn-row">
                  <button
                    type="submit"
                    className="btn btn--secondary btn--sm"
                    disabled={deactivating}
                  >
                    Deactivate this runner
                  </button>
                  <span className="muted">
                    Deactivating hides them from new entry lists. Published results are untouched.
                  </span>
                </div>
              </form>
            </>
          ) : (
            <p className="muted">Choose a runner above to edit their details.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="merge-runners">
        <div className="section-head">
          <h2 id="merge-runners">Merge duplicates</h2>
        </div>
        <form action={mergeFormAction} className="card stack">
          {csrfField}
          <FormFeedback state={mergeState} />
          <p className="muted">
            Moves the duplicate&rsquo;s results onto the surviving record and marks the duplicate as
            merged. If both records already hold a result for the same round or race, that one stays
            with the duplicate and is reported back to you rather than being overwritten.
          </p>

          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor="duplicateId">Duplicate to merge away</label>
              <select id="duplicateId" name="duplicateId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {editable.map((runner) => (
                  <option key={runner.id} value={runner.id}>
                    {runner.familyName}, {runner.givenName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="survivingId">Record to keep</label>
              <select id="survivingId" name="survivingId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {editable.map((runner) => (
                  <option key={runner.id} value={runner.id}>
                    {runner.familyName}, {runner.givenName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="btn-row">
            <SubmitButton pending={merging} variant="danger">
              Merge runners
            </SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="all-runners">
        <div className="section-head">
          <h2 id="all-runners">All runners</h2>
          <p className="muted">{runners.length} record(s)</p>
        </div>
        <ScrollableTable label="All runners">
          <table>
            <caption>Every runner except merged records.</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Results
                </th>
              </tr>
            </thead>
            <tbody>
              {runners.map((runner) => (
                <tr key={runner.id}>
                  <th scope="row" style={{ fontWeight: 600 }}>
                    {runner.displayName}
                  </th>
                  <td>{runner.category === 'MALE' ? 'Male' : 'Female'}</td>
                  <td>
                    <span className={`tag${runner.status === 'ACTIVE' ? ' tag--green' : ''}`}>
                      {runner.status === 'ACTIVE' ? '✓ Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="num">{runner.resultCount}</td>
                </tr>
              ))}
              {runners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No runners yet. Add the first one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ScrollableTable>
      </section>
    </div>
  );
}
