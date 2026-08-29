'use client';

import { useActionState } from 'react';
import { createRaceAction, setRaceStateAction, updateRaceAction } from '../actions';
import { IDLE, type ActionState } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

export interface RaceFormValues {
  id?: string;
  name: string;
  shortLabel: string;
  date: string;
  startTime: string;
  locationName: string;
  address: string;
  mapUrl: string;
  distanceLabel: string;
  distanceMetres: string;
  leagueName: string;
  entryInstructions: string;
  externalUrl: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
  isChampionshipQualifier: boolean;
}

const EMPTY: RaceFormValues = {
  name: '',
  shortLabel: '',
  date: '',
  startTime: '',
  locationName: '',
  address: '',
  mapUrl: '',
  distanceLabel: '',
  distanceMetres: '',
  leagueName: '',
  entryInstructions: '',
  externalUrl: '',
  status: 'SCHEDULED',
  isChampionshipQualifier: false,
};

export function RaceCreateForm({ csrfField }: { csrfField: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(createRaceAction, IDLE);
  return (
    <section aria-labelledby="create-race">
      <div className="section-head">
        <h2 id="create-race">Add a race</h2>
      </div>
      <RaceFields
        action={formAction}
        state={state}
        pending={pending}
        values={EMPTY}
        csrfField={csrfField}
        submitLabel="Create race"
      />
    </section>
  );
}

export function RaceEditForm({
  values,
  csrfField,
}: {
  values: RaceFormValues;
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(updateRaceAction, IDLE);
  return (
    <section aria-labelledby="edit-race">
      <div className="section-head">
        <h2 id="edit-race">Race details</h2>
      </div>
      <RaceFields
        action={formAction}
        state={state}
        pending={pending}
        values={values}
        csrfField={csrfField}
        submitLabel="Save race"
      />
    </section>
  );
}

function RaceFields({
  action,
  state,
  pending,
  values,
  csrfField,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  state: ActionState;
  pending: boolean;
  values: RaceFormValues;
  csrfField: React.ReactNode;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card stack">
      {csrfField}
      {values.id ? <input type="hidden" name="raceId" value={values.id} /> : null}
      <FormFeedback state={state} />

      <div className="form-grid form-grid--2">
        <div className="field form-grid__full">
          <label htmlFor="race-name">Race name</label>
          <input id="race-name" name="name" required defaultValue={values.name} />
          <FieldError id="race-name-error" message={state.fieldErrors?.name} />
        </div>

        <div className="field">
          <label htmlFor="race-shortLabel">Short label</label>
          <input
            id="race-shortLabel"
            name="shortLabel"
            required
            maxLength={12}
            defaultValue={values.shortLabel}
            aria-describedby="shortLabel-hint"
          />
          <p className="field__hint" id="shortLabel-hint">
            The column heading in the championship table, for example <code>PCHALF</code>.
          </p>
          <FieldError id="shortLabel-error" message={state.fieldErrors?.shortLabel} />
        </div>

        <div className="field">
          <label htmlFor="race-status">Status</label>
          <select id="race-status" name="status" defaultValue={values.status}>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="POSTPONED">Postponed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="race-date">Date</label>
          <input id="race-date" name="date" type="date" required defaultValue={values.date} />
          <FieldError id="race-date-error" message={state.fieldErrors?.date} />
        </div>

        <div className="field">
          <label htmlFor="race-startTime">Start time</label>
          <input
            id="race-startTime"
            name="startTime"
            type="time"
            defaultValue={values.startTime}
            aria-describedby="startTime-hint"
          />
          <p className="field__hint" id="startTime-hint">
            UK local time. Leave blank if not confirmed.
          </p>
        </div>

        <div className="field">
          <label htmlFor="race-distanceLabel">Distance</label>
          <input
            id="race-distanceLabel"
            name="distanceLabel"
            placeholder="Half marathon"
            defaultValue={values.distanceLabel}
          />
        </div>

        <div className="field">
          <label htmlFor="race-leagueName">League or series</label>
          <input id="race-leagueName" name="leagueName" defaultValue={values.leagueName} />
        </div>

        <div className="field">
          <label htmlFor="race-locationName">Location</label>
          <input id="race-locationName" name="locationName" defaultValue={values.locationName} />
        </div>

        <div className="field">
          <label htmlFor="race-address">Address</label>
          <input id="race-address" name="address" defaultValue={values.address} />
        </div>

        <div className="field">
          <label htmlFor="race-mapUrl">Map link</label>
          <input
            id="race-mapUrl"
            name="mapUrl"
            type="url"
            placeholder="https://…"
            defaultValue={values.mapUrl}
          />
          <FieldError id="mapUrl-error" message={state.fieldErrors?.mapUrl} />
        </div>

        <div className="field">
          <label htmlFor="race-externalUrl">Race information link</label>
          <input
            id="race-externalUrl"
            name="externalUrl"
            type="url"
            placeholder="https://…"
            defaultValue={values.externalUrl}
          />
          <FieldError id="externalUrl-error" message={state.fieldErrors?.externalUrl} />
        </div>

        <div className="field form-grid__full">
          <label htmlFor="race-entryInstructions">Entry instructions</label>
          <textarea
            id="race-entryInstructions"
            name="entryInstructions"
            defaultValue={values.entryInstructions}
          />
        </div>

        <div className="form-grid__full">
          <div className="checkbox-row">
            <input
              id="race-qualifier"
              name="isChampionshipQualifier"
              type="checkbox"
              defaultChecked={values.isChampionshipQualifier}
              aria-describedby="qualifier-hint"
            />
            <label htmlFor="race-qualifier">Counts towards the club championship</label>
          </div>
          <p className="field__hint" id="qualifier-hint">
            Creates that year&rsquo;s championship if needed, and adds a column to its table.
          </p>
          <FieldError id="qualifier-error" message={state.fieldErrors?.isChampionshipQualifier} />
        </div>
      </div>

      <div className="btn-row">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function RaceStateForm({
  races,
  csrfField,
}: {
  races: readonly { id: string; name: string; state: string }[];
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(setRaceStateAction, IDLE);
  if (races.length === 0) return null;

  return (
    <section aria-labelledby="race-visibility">
      <div className="section-head">
        <h2 id="race-visibility">Race visibility</h2>
      </div>
      <form action={formAction} className="card stack">
        {csrfField}
        <FormFeedback state={state} />
        <div className="form-grid form-grid--2">
          <div className="field">
            <label htmlFor="race-state-id">Race</label>
            <select id="race-state-id" name="raceId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {races.map((race) => (
                <option key={race.id} value={race.id}>
                  {race.name} ({race.state.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="race-state-value">Set to</label>
            <select id="race-state-value" name="state" defaultValue="PUBLISHED">
              <option value="DRAFT">Draft — hidden from the public</option>
              <option value="PUBLISHED">Published — visible to everyone</option>
            </select>
          </div>
        </div>
        <div className="btn-row">
          <SubmitButton pending={pending}>Update visibility</SubmitButton>
        </div>
      </form>
    </section>
  );
}
