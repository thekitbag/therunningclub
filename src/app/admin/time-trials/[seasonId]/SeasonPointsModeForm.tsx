'use client';

import { useActionState } from 'react';
import { setSeasonPointsModeAction } from '../../actions';
import { IDLE } from '@/lib/action-state';
import { FormFeedback, SubmitButton } from '@/components/admin/FormFeedback';

type PointsMode = 'FINISHING_AND_IMPROVEMENT' | 'IMPROVEMENT_ONLY';

export function SeasonPointsModeForm({
  seasonId,
  pointsMode,
  locked,
  csrfField,
}: {
  seasonId: string;
  pointsMode: PointsMode;
  locked: boolean;
  csrfField: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(setSeasonPointsModeAction, IDLE);

  return (
    <section aria-labelledby="points-method-heading">
      <div className="section-head">
        <h2 id="points-method-heading">Points method</h2>
      </div>
      <form action={formAction} className="card stack">
        {csrfField}
        <input type="hidden" name="seasonId" value={seasonId} />
        <FormFeedback state={state} />
        <p className="muted">
          Improvement-only seasons still show finish position and time, but those positions award no
          points. The best four improvement scores form the leaderboard.
        </p>
        <div className="field" style={{ maxWidth: '32rem' }}>
          <label htmlFor="points-mode">Leaderboard points</label>
          <select id="points-mode" name="pointsMode" defaultValue={pointsMode} disabled={locked}>
            <option value="FINISHING_AND_IMPROVEMENT">Finishing and improvement points</option>
            <option value="IMPROVEMENT_ONLY">Improvement points only</option>
          </select>
          <p className="field__hint">
            {locked
              ? 'Fixed because this season already has a published round.'
              : 'Can be changed until the first round is published. Draft scores are recalculated immediately.'}
          </p>
        </div>
        {!locked ? (
          <div className="btn-row">
            <SubmitButton pending={pending}>Update points method</SubmitButton>
          </div>
        ) : null}
      </form>
    </section>
  );
}
