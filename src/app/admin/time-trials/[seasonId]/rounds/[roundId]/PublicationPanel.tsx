'use client';

import { useActionState } from 'react';
import { publishRoundAction, unpublishRoundAction } from '../../../../actions';
import { IDLE } from '@/lib/action-state';
import { FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';
import type { PublicationImpact } from '@/services/time-trials';
import { ScrollableTable } from '@/components/ScrollableTable';

/**
 * Publication with a dry-run impact preview.
 *
 * The specification requires an administrator to see what a consequential
 * change will do before confirming it. The impact below is computed by scoring
 * the season twice — once as the public currently sees it, once as it would be
 * — and diffing the two. Nothing is written to produce it.
 */
export function PublicationPanel({
  roundId,
  published,
  impact,
  csrfPublish,
  csrfUnpublish,
}: {
  roundId: string;
  published: boolean;
  impact: PublicationImpact;
  csrfPublish: React.ReactNode;
  csrfUnpublish: React.ReactNode;
}) {
  const [publishState, publishAction, publishing] = useActionState(publishRoundAction, IDLE);
  const [unpublishState, unpublishAction, unpublishing] = useActionState(
    unpublishRoundAction,
    IDLE,
  );

  return (
    <section aria-labelledby="publish-heading">
      <div className="section-head">
        <h2 id="publish-heading">{published ? 'Published' : 'Publish this round'}</h2>
      </div>

      <div className="card stack">
        <FormFeedback state={publishState} />
        <FormFeedback state={unpublishState} />

        {impact.blockingProblems.length > 0 ? (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">
              This round cannot be published yet ({impact.blockingProblems.length} problem
              {impact.blockingProblems.length === 1 ? '' : 's'})
            </p>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              {impact.blockingProblems.map((problem, index) => (
                <li key={index}>
                  <strong>{problem.runnerName}</strong>: {problem.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="stat-row">
          <div className="stat">
            <p className="stat__value">{impact.resultCount}</p>
            <p className="stat__label">Results in this round</p>
          </div>
          <div className="stat">
            <p className="stat__value">{impact.affectedLaterRounds.length}</p>
            <p className="stat__label">Later rounds affected</p>
          </div>
          <div className="stat">
            <p className="stat__value">{impact.standingsChanges.length}</p>
            <p className="stat__label">Season totals changing</p>
          </div>
        </div>

        {impact.affectedLaterRounds.length > 0 ? (
          <div className="notice notice--warn">
            <p className="notice__title">Later rounds will change</p>
            <p>
              Publishing this round adds it to the comparison chain, so improvement points in the
              rounds below are recalculated:
            </p>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              {impact.affectedLaterRounds.map((round) => (
                <li key={round.ordinal}>
                  Round {round.ordinal} — {round.changedResults} result
                  {round.changedResults === 1 ? '' : 's'} change
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {impact.standingsChanges.length > 0 ? (
          <details className="explainer">
            <summary>Season totals that will change ({impact.standingsChanges.length})</summary>
            <div className="explainer__body">
              <ScrollableTable label="Season totals that will change">
                <table className="preview-table">
                  <caption>How the published best-four totals change.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Runner</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="num">
                        Now
                      </th>
                      <th scope="col" className="num">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.standingsChanges.map((change, index) => (
                      <tr key={index}>
                        <th scope="row">{change.runnerName}</th>
                        <td>{change.category === 'MALE' ? 'Male' : 'Female'}</td>
                        <td className="num">{change.from ?? '—'}</td>
                        <td className="num" style={{ fontWeight: 700 }}>
                          {change.to}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          </details>
        ) : null}

        <div className="btn-row">
          {!published ? (
            <form action={publishAction}>
              {csrfPublish}
              <input type="hidden" name="roundId" value={roundId} />
              <SubmitButton pending={publishing}>Publish round</SubmitButton>
            </form>
          ) : (
            <form action={unpublishAction}>
              {csrfUnpublish}
              <input type="hidden" name="roundId" value={roundId} />
              <SubmitButton pending={unpublishing} variant="danger">
                Unpublish round
              </SubmitButton>
            </form>
          )}
          <p className="muted" style={{ maxWidth: '40ch' }}>
            {published
              ? 'Unpublishing removes this round from public standings and recalculates every later round.'
              : 'Publishing makes these results public and recalculates the season standings.'}
          </p>
        </div>
      </div>
    </section>
  );
}
