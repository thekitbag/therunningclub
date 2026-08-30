'use client';

import { useActionState } from 'react';
import { setChampionshipStateAction } from '../actions';
import { IDLE } from '@/lib/action-state';
import { FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

export function ChampionshipStateForm({
  championships,
  csrfField,
}: {
  championships: readonly { id: string; year: number; state: string }[];
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(setChampionshipStateAction, IDLE);
  if (championships.length === 0) return null;

  return (
    <section aria-labelledby="championship-visibility">
      <div className="section-head">
        <h2 id="championship-visibility">Championship visibility</h2>
      </div>
      <form action={formAction} className="card stack">
        {csrfField}
        <FormFeedback state={state} />
        <p className="muted">
          Publishing makes the year&rsquo;s table public. Individual race placings only appear once
          the race itself is also published.
        </p>
        <div className="form-grid form-grid--2">
          <div className="field">
            <label htmlFor="championship-id">Championship</label>
            <select id="championship-id" name="championshipId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {championships.map((championship) => (
                <option key={championship.id} value={championship.id}>
                  {championship.year} ({championship.state.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="championship-state">Set to</label>
            <select id="championship-state" name="state" defaultValue="PUBLISHED">
              <option value="DRAFT">Draft — hidden from the public</option>
              <option value="PUBLISHED">Published — visible to everyone</option>
              <option value="ARCHIVED">Archived — visible in the year list</option>
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
