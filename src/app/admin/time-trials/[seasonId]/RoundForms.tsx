'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createRoundAction, updateRoundAction } from '../../actions';
import { IDLE } from '@/lib/action-state';
import { FieldError, FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
// Imported from the types module rather than the domain barrel: the barrel
// re-exports the vendored age-grade tables, which have no business being
// shipped to a browser.
import { ROUNDS_PER_SEASON } from '@/domain/scoring/types';
import { ScrollableTable } from '@/components/ScrollableTable';

interface RoundSummary {
  id: string;
  ordinal: number;
  name: string;
  date: string;
  displayDate: string;
  state: string;
  resultCount: number;
}

export function RoundForms({
  seasonId,
  rounds,
  nextOrdinal,
  csrfField,
  csrfFieldEdit,
}: {
  seasonId: string;
  rounds: readonly RoundSummary[];
  nextOrdinal: number | null;
  csrfField: React.ReactNode;
  csrfFieldEdit: React.ReactNode;
}) {
  const [createState, createFormAction, creating] = useActionState(createRoundAction, IDLE);
  const [editState, editFormAction, editing] = useActionState(updateRoundAction, IDLE);
  const [selectedId, setSelectedId] = useState('');

  const selected = rounds.find((round) => round.id === selectedId);

  return (
    <div className="stack-lg">
      <section aria-labelledby="rounds-list">
        <div className="section-head">
          <h2 id="rounds-list">Rounds</h2>
          <p className="muted">
            {rounds.length} of {ROUNDS_PER_SEASON} created
          </p>
        </div>
        {rounds.length === 0 ? (
          <p className="muted">No rounds yet. Add the first one below.</p>
        ) : (
          <ScrollableTable label="Rounds in this season">
            <table>
              <caption>
                Rounds in this season. Open a round to enter or publish its results.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Round</th>
                  <th scope="col">Name</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">
                    Results
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((round) => (
                  <tr key={round.id}>
                    <th scope="row">R{round.ordinal}</th>
                    <td>{round.name}</td>
                    <td className="nowrap">{round.displayDate}</td>
                    <td className="num">{round.resultCount}</td>
                    <td>
                      <span className={`tag${round.state === 'PUBLISHED' ? ' tag--green' : ''}`}>
                        {round.state === 'PUBLISHED' ? '✓ Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={`/admin/time-trials/${seasonId}/rounds/${round.id}`}
                      >
                        Enter results
                        <span className="visually-hidden"> for round {round.ordinal}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>

      {nextOrdinal !== null ? (
        <section aria-labelledby="add-round">
          <div className="section-head">
            <h2 id="add-round">Add a round</h2>
          </div>
          <form action={createFormAction} className="card stack">
            {csrfField}
            <input type="hidden" name="seasonId" value={seasonId} />
            <FormFeedback state={createState} />

            <div className="form-grid form-grid--2">
              <div className="field">
                <label htmlFor="round-ordinal">Round number</label>
                <select id="round-ordinal" name="ordinal" defaultValue={String(nextOrdinal)}>
                  {Array.from({ length: ROUNDS_PER_SEASON }, (_, index) => index + 1)
                    .filter((ordinal) => !rounds.some((round) => round.ordinal === ordinal))
                    .map((ordinal) => (
                      <option key={ordinal} value={ordinal}>
                        Round {ordinal}
                      </option>
                    ))}
                </select>
                <FieldError id="ordinal-error" message={createState.fieldErrors?.ordinal} />
              </div>
              <div className="field">
                <label htmlFor="round-date">Date</label>
                <input id="round-date" name="date" type="date" required />
              </div>
              <div className="field form-grid__full">
                <label htmlFor="round-name">Name</label>
                <input id="round-name" name="name" required defaultValue={`Round ${nextOrdinal}`} />
              </div>
            </div>

            <div className="btn-row">
              <SubmitButton pending={creating}>Add round</SubmitButton>
            </div>
          </form>
        </section>
      ) : (
        <p className="notice notice--info">
          All {ROUNDS_PER_SEASON} rounds have been created for this season.
        </p>
      )}

      {rounds.length > 0 ? (
        <section aria-labelledby="edit-round">
          <div className="section-head">
            <h2 id="edit-round">Edit a round</h2>
          </div>
          <div className="card stack">
            <div className="field">
              <label htmlFor="round-select">Choose a round</label>
              <select
                id="round-select"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">Choose…</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    Round {round.ordinal} — {round.name}
                  </option>
                ))}
              </select>
            </div>

            {selected ? (
              <form action={editFormAction} className="stack" key={selected.id}>
                {csrfFieldEdit}
                <input type="hidden" name="roundId" value={selected.id} />
                <FormFeedback state={editState} />

                <div className="notice notice--warn">
                  <p>
                    Moving a round&rsquo;s date or number changes which earlier result each runner
                    is compared against, so improvement points in this and later rounds can change.
                    The whole season is recalculated when you save.
                  </p>
                </div>

                <div className="form-grid form-grid--2">
                  <div className="field">
                    <label htmlFor="edit-ordinal">Round number</label>
                    <select
                      id="edit-ordinal"
                      name="ordinal"
                      defaultValue={String(selected.ordinal)}
                    >
                      {Array.from({ length: ROUNDS_PER_SEASON }, (_, index) => index + 1).map(
                        (ordinal) => (
                          <option key={ordinal} value={ordinal}>
                            Round {ordinal}
                          </option>
                        ),
                      )}
                    </select>
                    <FieldError id="edit-ordinal-error" message={editState.fieldErrors?.ordinal} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-date">Date</label>
                    <input
                      id="edit-date"
                      name="date"
                      type="date"
                      required
                      defaultValue={selected.date}
                    />
                  </div>
                  <div className="field form-grid__full">
                    <label htmlFor="edit-name">Name</label>
                    <input id="edit-name" name="name" required defaultValue={selected.name} />
                  </div>
                </div>

                <div className="btn-row">
                  <SubmitButton pending={editing}>Save and recalculate</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="muted">Choose a round above to edit it.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
