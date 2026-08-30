'use client';

import { useActionState, useState } from 'react';
import { saveRoundResultsAction } from '../../../../actions';
import { IDLE } from '@/lib/action-state';
import { FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import { ScrollableTable } from '@/components/ScrollableTable';

interface RunnerOption {
  id: string;
  label: string;
}

interface ExistingResult {
  runnerId: string;
  distanceChoice: 'TWO_LAP' | 'THREE_LAP';
  time: string;
}

interface Row {
  key: number;
  runnerId: string;
  distanceChoice: 'TWO_LAP' | 'THREE_LAP';
  time: string;
}

const SPARE_ROWS = 4;

/**
 * Keyboard-efficient result entry.
 *
 * The tab order within a row is runner, distance, time, so an operator working
 * from a paper sheet can key an entire round without touching the mouse. Blank
 * rows are ignored on save, which is why spare rows can sit at the bottom
 * permanently rather than needing an "add row" click per runner.
 *
 * Saving replaces the whole round: finishing points depend on the entire field,
 * so a row-at-a-time save would leave every other runner's position wrong until
 * the last row arrived.
 */
export function ResultEntryGrid({
  roundId,
  runners,
  existing,
  twoLapKm,
  threeLapKm,
  csrfField,
}: {
  roundId: string;
  runners: readonly RunnerOption[];
  existing: readonly ExistingResult[];
  twoLapKm: number;
  threeLapKm: number;
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(saveRoundResultsAction, IDLE);

  const [rows, setRows] = useState<Row[]>(() => [
    ...existing.map((result, index) => ({ key: index, ...result })),
    ...Array.from({ length: SPARE_ROWS }, (_, index) => ({
      key: existing.length + index,
      runnerId: '',
      distanceChoice: 'TWO_LAP' as const,
      time: '',
    })),
  ]);

  const [nextKey, setNextKey] = useState(existing.length + SPARE_ROWS);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRows = () => {
    setRows((current) => [
      ...current,
      ...Array.from({ length: SPARE_ROWS }, (_, index) => ({
        key: nextKey + index,
        runnerId: '',
        distanceChoice: 'TWO_LAP' as const,
        time: '',
      })),
    ]);
    setNextKey((key) => key + SPARE_ROWS);
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  // Runners already chosen in another row, so the same person cannot be added
  // twice — the server enforces this too, but catching it here is kinder.
  const chosen = new Set(rows.map((row) => row.runnerId).filter(Boolean));

  const filledRows = rows.filter((row) => row.runnerId && row.time.trim());

  return (
    <section aria-labelledby="entry-heading">
      <div className="section-head">
        <h2 id="entry-heading">Enter results</h2>
        <p className="muted">
          {filledRows.length} row{filledRows.length === 1 ? '' : 's'} ready to save
        </p>
      </div>

      <form action={formAction} className="card stack">
        {csrfField}
        <input type="hidden" name="roundId" value={roundId} />
        <FormFeedback state={state} />

        <p className="muted">
          Times can be typed as <code>mm:ss</code>, <code>mm:ss.t</code> or <code>hh:mm:ss</code>.
          Leave a row blank to ignore it. Saving replaces every result in this round.
        </p>

        <ScrollableTable label="Result entry grid">
          <table className="entry-grid">
            <caption className="visually-hidden">
              Result entry grid. Each row is one runner: choose the runner, the distance they ran,
              and their finishing time.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Row</span>
                </th>
                <th scope="col">Runner</th>
                <th scope="col">Distance</th>
                <th scope="col">Time</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const duplicate =
                  row.runnerId !== '' &&
                  rows.filter((other) => other.runnerId === row.runnerId).length > 1;

                return (
                  <tr key={row.key}>
                    <td>{index + 1}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`runner-${row.key}`}>
                        Runner for row {index + 1}
                      </label>
                      <select
                        id={`runner-${row.key}`}
                        name="runnerId"
                        value={row.runnerId}
                        onChange={(event) => update(row.key, { runnerId: event.target.value })}
                        aria-invalid={duplicate ? true : undefined}
                        aria-describedby={duplicate ? `dup-${row.key}` : undefined}
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
                      {duplicate ? (
                        <p className="field__error" id={`dup-${row.key}`}>
                          This runner is already in another row.
                        </p>
                      ) : null}
                    </td>
                    <td className="distance-cell">
                      <label className="visually-hidden" htmlFor={`distance-${row.key}`}>
                        Distance for row {index + 1}
                      </label>
                      <select
                        id={`distance-${row.key}`}
                        name="distanceChoice"
                        value={row.distanceChoice}
                        onChange={(event) =>
                          update(row.key, {
                            distanceChoice: event.target.value as 'TWO_LAP' | 'THREE_LAP',
                          })
                        }
                      >
                        <option value="TWO_LAP">Two laps ({twoLapKm} km)</option>
                        <option value="THREE_LAP">Three laps ({threeLapKm} km)</option>
                      </select>
                    </td>
                    <td className="time-cell">
                      <label className="visually-hidden" htmlFor={`time-${row.key}`}>
                        Time for row {index + 1}
                      </label>
                      <input
                        id={`time-${row.key}`}
                        name="time"
                        inputMode="numeric"
                        placeholder="mm:ss"
                        value={row.time}
                        onChange={(event) => update(row.key, { time: event.target.value })}
                        aria-invalid={
                          state.fieldErrors?.[`entries.${index}.time`] ? true : undefined
                        }
                      />
                      {state.fieldErrors?.[`entries.${index}.time`] ? (
                        <p className="field__error">{state.fieldErrors[`entries.${index}.time`]}</p>
                      ) : null}
                    </td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => removeRow(row.key)}
                      >
                        <span aria-hidden="true">✕</span>
                        <span className="visually-hidden">Remove row {index + 1}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>

        <div className="btn-row">
          <SubmitButton pending={pending}>Save results</SubmitButton>
          <button type="button" className="btn btn--secondary" onClick={addRows}>
            Add {SPARE_ROWS} more rows
          </button>
        </div>
      </form>
    </section>
  );
}
