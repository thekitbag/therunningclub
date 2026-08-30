'use client';

import { useActionState, useState } from 'react';
import { createSeasonAction, setSeasonStateAction } from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

interface SeasonSummary {
  id: string;
  name: string;
  type: 'SUMMER' | 'WINTER';
  state: string;
  startDate: string;
  endDate: string;
  roundCount: number;
  publishedRounds: number;
}

/**
 * Season creation.
 *
 * Choosing a season type fills in the club's standard date range so a volunteer
 * does not have to remember that winter runs October to March. The distances
 * are not editable: they are a property of the season type and are snapshotted
 * onto the record when it is created.
 */
export function SeasonForms({
  seasons,
  defaults,
  csrfField,
  csrfFieldState,
}: {
  seasons: readonly SeasonSummary[];
  defaults: {
    winter: { startDate: string; endDate: string };
    summer: { startDate: string; endDate: string };
  };
  csrfField: React.ReactNode;
  csrfFieldState: React.ReactNode;
}) {
  const [createState, createFormAction, creating] = useActionState(createSeasonAction, IDLE);
  const [stateState, stateFormAction, updatingState] = useActionState(setSeasonStateAction, IDLE);

  const [type, setType] = useState<'WINTER' | 'SUMMER'>('WINTER');
  const dates = type === 'WINTER' ? defaults.winter : defaults.summer;

  return (
    <div className="stack-lg">
      <section aria-labelledby="create-season">
        <div className="section-head">
          <h2 id="create-season">Create a season</h2>
        </div>
        <form action={createFormAction} className="card stack">
          {csrfField}
          <FormFeedback state={createState} />

          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor="season-type">Season</label>
              <select
                id="season-type"
                name="type"
                value={type}
                onChange={(event) => setType(event.target.value as 'WINTER' | 'SUMMER')}
              >
                <option value="WINTER">Winter — 5 km and 7.5 km</option>
                <option value="SUMMER">Summer — 6 km and 8 km</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="season-name">Name</label>
              <input
                id="season-name"
                name="name"
                required
                key={type}
                defaultValue={
                  type === 'WINTER'
                    ? `Winter ${dates.startDate.slice(0, 4)}/${String(
                        (Number(dates.startDate.slice(0, 4)) + 1) % 100,
                      ).padStart(2, '0')}`
                    : `Summer ${dates.startDate.slice(0, 4)}`
                }
                aria-invalid={createState.fieldErrors?.name ? true : undefined}
              />
              <FieldError id="season-name-error" message={createState.fieldErrors?.name} />
            </div>

            <div className="field">
              <label htmlFor="season-start">First day</label>
              <input
                id="season-start"
                name="startDate"
                type="date"
                required
                key={`start-${type}`}
                defaultValue={dates.startDate}
              />
            </div>

            <div className="field">
              <label htmlFor="season-end">Last day</label>
              <input
                id="season-end"
                name="endDate"
                type="date"
                required
                key={`end-${type}`}
                defaultValue={dates.endDate}
              />
              <FieldError id="season-end-error" message={createState.fieldErrors?.endDate} />
            </div>
          </div>

          <div className="btn-row">
            <SubmitButton pending={creating}>Create season</SubmitButton>
          </div>
        </form>
      </section>

      {seasons.length > 0 ? (
        <section aria-labelledby="publish-season">
          <div className="section-head">
            <h2 id="publish-season">Season visibility</h2>
          </div>
          <form action={stateFormAction} className="card stack">
            {csrfFieldState}
            <FormFeedback state={stateState} />
            <p className="muted">
              A season must be published before any of its rounds appear on the public site, even
              rounds you have already published individually.
            </p>
            <div className="form-grid form-grid--2">
              <div className="field">
                <label htmlFor="state-season">Season</label>
                <select id="state-season" name="seasonId" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name} ({season.state.toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="state-value">Set to</label>
                <select id="state-value" name="state" defaultValue="PUBLISHED">
                  <option value="DRAFT">Draft — hidden from the public</option>
                  <option value="PUBLISHED">Published — visible to everyone</option>
                  <option value="ARCHIVED">Archived — visible in the season list</option>
                </select>
              </div>
            </div>
            <div className="btn-row">
              <SubmitButton pending={updatingState}>Update visibility</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
