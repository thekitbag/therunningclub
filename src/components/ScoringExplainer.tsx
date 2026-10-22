import { CHAMPIONSHIP_COUNTING_RACES, CHAMPIONSHIP_QUALIFYING_RACES } from '@/domain/scoring/types';
import type { TimeTrialPointsMode } from '@/domain/scoring/types';

/**
 * Plain-language scoring explanations.
 *
 * Both competitions have rules that are easy to get wrong from the table alone
 * — "why did I score nothing for improving?" and "why does a lower number win?"
 * — so each table carries its own explanation, collapsed by default.
 */

export function TimeTrialExplainer({ pointsMode }: { pointsMode: TimeTrialPointsMode }) {
  const improvementOnly = pointsMode === 'IMPROVEMENT_ONLY';

  return (
    <details className="explainer">
      <summary>How time-trial scoring works</summary>
      <div className="explainer__body prose">
        <p>
          {improvementOnly
            ? 'This season is scored only on age-grade improvement. Finish positions and times are still shown, but they do not award points.'
            : 'Every round is scored twice over: once for how fast you finished, and once for how much you improved. Your round total is the two added together.'}
        </p>
        <ul>
          <li>
            <strong>{improvementOnly ? 'Finish position.' : 'Finishing points.'}</strong>{' '}
            {improvementOnly
              ? 'The two-lap and three-lap fields are still ranked separately by time so the result order is clear, but position contributes no points this season.'
              : 'The two-lap and three-lap fields are ranked separately by time, but both use a points ladder based on whichever distance has more finishers. If the larger field has 15 runners, the winner of each distance gets 15 points, second gets 14, and so on. Everyone who finishes scores at least one point. Men and women run in the same field for this — the separate tables below just show the same points split by category.'}
          </li>
          <li>
            <strong>Age grade.</strong> Your time is compared with the world standard for your age
            and category, which is what lets a 60-year-old and a 25-year-old improve against each
            other fairly.
          </li>
          <li>
            <strong>Improvement points.</strong> Your age grade is compared with your most recent
            earlier result, even if that was at the other distance or in an earlier season. Everyone
            who improved — both distances, both categories — is ranked together. The points ladder
            is based only on those positive improvements. If 8 runners improved, the biggest
            improvement gets 8 points, the next gets 7, and so on. Runners whose age grade stayed
            the same or went down do not score and do not make that ladder larger.
          </li>
          <li>
            <strong>No comparison yet.</strong> If you have no earlier published result or imported
            historical age grade, there is nothing to improve on, so you score no improvement
            points. That is not a penalty — it just means the comparison starts next time.
          </li>
          <li>
            <strong>Season total.</strong> Your best four round totals count. Rounds five and six
            give you room to drop your two weakest scores.{' '}
            {improvementOnly ? 'Each round total is simply the improvement points earned.' : ''}
          </li>
          <li>
            <strong>Ties.</strong> Equal times and equal totals stay equal. Nothing is used to split
            them.
          </li>
        </ul>
      </div>
    </details>
  );
}

export function ChampionshipExplainer() {
  return (
    <details className="explainer">
      <summary>How club championship scoring works</summary>
      <div className="explainer__body prose">
        <p>
          The championship is a <strong>low score wins</strong> competition, which is the opposite
          way round to the time trial.
        </p>
        <ul>
          <li>
            <strong>Race scores.</strong> In each qualifying race the first club member home in
            their category scores 1, the second scores 2, and so on. Only club members are counted,
            not the rest of the race field.
          </li>
          <li>
            <strong>Getting eligible.</strong> You need {CHAMPIONSHIP_QUALIFYING_RACES} qualifying
            races before you appear in the standings. Until then you are listed as not yet eligible,
            with your progress shown.
          </li>
          <li>
            <strong>Your total.</strong> Once you have {CHAMPIONSHIP_QUALIFYING_RACES} or more
            races, your {CHAMPIONSHIP_COUNTING_RACES} lowest scores are added together. Running more
            than {CHAMPIONSHIP_COUNTING_RACES} lets you drop your weaker results.
          </li>
          <li>
            <strong>Winning.</strong> The lowest total leads. Equal totals stay tied.
          </li>
          <li>
            <strong>Missed races.</strong> A race you did not run is shown as a dash, not a zero —
            it simply does not count either way.
          </li>
        </ul>
      </div>
    </details>
  );
}
