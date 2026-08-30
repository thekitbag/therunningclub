'use client';

import { useActionState, useState } from 'react';
import { saveRaceResultsAction } from '../../actions';
import { IDLE } from '@/lib/action-state';
import { FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import { ScrollableTable } from '@/components/ScrollableTable';

interface RunnerOption {
  id: string;
  label: string;
  category: 'MALE' | 'FEMALE';
}

interface Row {
  key: number;
  runnerId: string;
  categoryPosition: string;
}

const SPARE_ROWS = 4;

/**
 * Club placings for a qualifying race.
 *
 * The position entered is the runner's place *among club members of their own
 * category*, not their overall race position. That is the number the club's own
 * spreadsheet has always held, and it means volunteers never need the full
 * external results to score the championship.
 */
export function ChampionshipPlacingsGrid({
  raceId,
  runners,
  existing,
  csrfField,
}: {
  raceId: string;
  runners: readonly RunnerOption[];
  existing: readonly { runnerId: string; categoryPosition: string }[];
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(saveRaceResultsAction, IDLE);

  const [rows, setRows] = useState<Row[]>(() => [
    ...existing.map((result, index) => ({ key: index, ...result })),
    ...Array.from({ length: SPARE_ROWS }, (_, index) => ({
      key: existing.length + index,
      runnerId: '',
      categoryPosition: '',
    })),
  ]);
  const [nextKey, setNextKey] = useState(existing.length + SPARE_ROWS);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRows = () => {
    setRows((current) => [
      ...current,
      ...Array.from({ length: SPARE_ROWS }, (_, index) => ({
        key: nextKey + index,
        runnerId: '',
        categoryPosition: '',
      })),
    ]);
    setNextKey((key) => key + SPARE_ROWS);
  };

  const categoryOf = (runnerId: string) => runners.find((r) => r.id === runnerId)?.category;
  const chosen = new Set(rows.map((row) => row.runnerId).filter(Boolean));

  return (
    <section aria-labelledby="placings-heading">
      <div className="section-head">
        <h2 id="placings-heading">Club placings</h2>
      </div>

      <form action={formAction} className="card stack">
        {csrfField}
        <input type="hidden" name="raceId" value={raceId} />
        <FormFeedback state={state} />

        <div className="notice notice--info">
          <p>
            Enter each member&rsquo;s position{' '}
            <strong>among club runners of their own category</strong> — the first club man home is
            1, the first club woman home is also 1. You do not need the full race results. For a
            dead heat, give both runners the same position and skip the next one.
          </p>
        </div>

        <ScrollableTable label="Club placings entry grid">
          <table className="entry-grid">
            <caption className="visually-hidden">
              Club placings entry grid. Each row is one runner and their club category position.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Row</span>
                </th>
                <th scope="col">Runner</th>
                <th scope="col">Category</th>
                <th scope="col">Club position</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td>{index + 1}</td>
                  <td>
                    <label className="visually-hidden" htmlFor={`cr-runner-${row.key}`}>
                      Runner for row {index + 1}
                    </label>
                    <select
                      id={`cr-runner-${row.key}`}
                      name="runnerId"
                      value={row.runnerId}
                      onChange={(event) => update(row.key, { runnerId: event.target.value })}
                    >
                      <option value="">—</option>
                      {runners.map((runner) => (
                        <option
                          key={runner.id}
                          value={runner.id}
                          disabled={runner.id !== row.runnerId && chosen.has(runner.id)}
                        >
                          {runner.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {row.runnerId ? (
                      <span className="tag">
                        {categoryOf(row.runnerId) === 'MALE' ? 'Male' : 'Female'}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="time-cell">
                    <label className="visually-hidden" htmlFor={`cr-pos-${row.key}`}>
                      Club position for row {index + 1}
                    </label>
                    <input
                      id={`cr-pos-${row.key}`}
                      name="categoryPosition"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={row.categoryPosition}
                      onChange={(event) =>
                        update(row.key, { categoryPosition: event.target.value })
                      }
                      aria-invalid={
                        state.fieldErrors?.[`entries.${index}.categoryPosition`] ? true : undefined
                      }
                    />
                    {state.fieldErrors?.[`entries.${index}.categoryPosition`] ? (
                      <p className="field__error">
                        {state.fieldErrors[`entries.${index}.categoryPosition`]}
                      </p>
                    ) : null}
                  </td>
                  <td className="action-cell">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    >
                      <span aria-hidden="true">✕</span>
                      <span className="visually-hidden">Remove row {index + 1}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>

        <div className="btn-row">
          <SubmitButton pending={pending}>Save placings</SubmitButton>
          <button type="button" className="btn btn--secondary" onClick={addRows}>
            Add {SPARE_ROWS} more rows
          </button>
        </div>
      </form>
    </section>
  );
}
