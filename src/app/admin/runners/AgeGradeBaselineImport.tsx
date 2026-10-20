'use client';

import { useActionState } from 'react';
import { importAgeGradeBaselinesAction } from '../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

export function AgeGradeBaselineImport({ csrfField }: { csrfField: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(importAgeGradeBaselinesAction, IDLE);

  return (
    <section aria-labelledby="historical-age-grades">
      <div className="section-head">
        <h2 id="historical-age-grades">Import previous age grades</h2>
      </div>
      <form action={formAction} className="card stack">
        {csrfField}
        <FormFeedback state={state} />
        <p className="muted">
          Use this once to seed each runner&rsquo;s last known age grade from before the app&rsquo;s
          results begin. Their first result in the app will compare with this value; every later
          result compares with their last published result, even across seasons or lap choices.
        </p>
        <div className="notice notice--warn">
          <p>
            The import replaces any existing opening baseline for runners in the file and
            recalculates all later seasons. The whole file is rejected if any row is invalid or
            ambiguous.
          </p>
        </div>
        <div className="form-grid form-grid--2">
          <div className="field">
            <label htmlFor="baseline-recordedOn">Baseline date</label>
            <input
              id="baseline-recordedOn"
              name="recordedOn"
              type="date"
              required
              aria-describedby="baseline-date-hint baseline-recordedOn-error"
              aria-invalid={state.fieldErrors?.recordedOn ? true : undefined}
            />
            <p className="field__hint" id="baseline-date-hint">
              Use the date of the source&rsquo;s last time trial. It must precede each imported
              runner&rsquo;s first app-managed result.
            </p>
            <FieldError id="baseline-recordedOn-error" message={state.fieldErrors?.recordedOn} />
          </div>
          <div className="field">
            <label htmlFor="baseline-sourceLabel">Source description</label>
            <input
              id="baseline-sourceLabel"
              name="sourceLabel"
              maxLength={160}
              placeholder="e.g. Winter results, September 2025"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="baseline-csvFile">CSV file</label>
            <input
              id="baseline-csvFile"
              name="csvFile"
              type="file"
              accept=".csv,text/csv"
              required
              aria-describedby="baseline-file-hint baseline-csvFile-error"
              aria-invalid={state.fieldErrors?.csvFile ? true : undefined}
            />
            <p className="field__hint" id="baseline-file-hint">
              Required headers: <code>Runner name</code> and <code>Previous age grade</code>. Names
              can be “First Last” or “Last, First”. A <code>Runner ID</code> column can be used
              instead of names. Percent signs are optional.
            </p>
            <FieldError id="baseline-csvFile-error" message={state.fieldErrors?.csvFile} />
          </div>
        </div>
        <div className="btn-row">
          <SubmitButton pending={pending}>Import and recalculate</SubmitButton>
        </div>
      </form>
    </section>
  );
}
