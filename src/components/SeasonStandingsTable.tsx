import { Bib } from '@/components/Bib';
import type { TimeTrialPointsMode } from '@/domain/scoring';
import type { PublicStandingRow } from '@/services/public-queries';

/**
 * Season leaderboard using the season's snapshotted counting rule.
 *
 * Scrolls horizontally on a phone rather than shrinking below readable size.
 * A round the runner missed shows an em dash, never a zero — conflating the two
 * would misrepresent both the runner and the standings.
 */
export function SeasonStandingsTable({
  rows,
  caption,
  roundOrdinals,
  pointsMode,
}: {
  rows: readonly PublicStandingRow[];
  caption: string;
  roundOrdinals: readonly number[];
  pointsMode: TimeTrialPointsMode;
}) {
  const attendanceMode = pointsMode === 'ATTENDANCE_AND_IMPROVEMENT';

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ padding: '1rem 0' }}>
        No results published in this category yet.
      </p>
    );
  }

  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={`${caption} — scrollable table`}
    >
      <table>
        <caption>
          {caption}.{' '}
          {attendanceMode
            ? 'Round cells show appearance + improvement points. Every appearance point counts; a shaded, bulleted cell marks one of the four improvement scores that count.'
            : 'A shaded, bulleted score is one of the four that count towards the total.'}{' '}
          An em dash means the runner did not run that round.
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Runner</th>
            {roundOrdinals.map((ordinal) => (
              <th key={ordinal} scope="col" className="num">
                <abbr
                  title={`Round ${ordinal}${attendanceMode ? ': appearance + improvement points' : ''}`}
                >
                  R{ordinal}
                </abbr>
              </th>
            ))}
            {attendanceMode ? (
              <>
                <th scope="col" className="num nowrap">
                  <abbr title="All appearance points">All App</abbr>
                </th>
                <th scope="col" className="num nowrap">
                  <abbr title="Best four improvement-point scores">Best 4 AG</abbr>
                </th>
              </>
            ) : null}
            <th scope="col" className="num nowrap">
              {attendanceMode ? 'Total' : 'Best 4'}
            </th>
            <th scope="col" className="num nowrap">
              Rounds
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.runner.id}>
              <td>
                <Bib
                  position={row.position}
                  tied={row.tied}
                  tone={row.position === 1 ? 'green' : 'quiet'}
                  size="sm"
                />
              </td>
              <th scope="row" style={{ fontWeight: 600 }}>
                {row.runner.displayName}
              </th>
              {row.rounds.map((round) => (
                <td key={round.ordinal} className={`num${round.counts ? ' counts' : ''}`}>
                  {round.total === null ? (
                    <>
                      <span aria-hidden="true" className="absent">
                        —
                      </span>
                      <span className="visually-hidden">did not run</span>
                    </>
                  ) : attendanceMode ? (
                    <>
                      <span aria-hidden="true">
                        {round.appearancePoints} + {round.improvementPoints}
                      </span>
                      <span className="visually-hidden">
                        {round.appearancePoints} appearance points plus {round.improvementPoints}{' '}
                        improvement points
                        {round.counts
                          ? '; improvement score counts'
                          : '; improvement score dropped'}
                      </span>
                    </>
                  ) : (
                    <>
                      {round.total}
                      {round.counts ? <span className="visually-hidden"> (counts)</span> : null}
                    </>
                  )}
                </td>
              ))}
              {attendanceMode ? (
                <>
                  <td className="num">{row.appearancePointsTotal}</td>
                  <td className="num">{row.improvementPointsTotal}</td>
                </>
              ) : null}
              <td className="num" style={{ fontWeight: 800 }}>
                {row.seasonTotal}
              </td>
              <td className="num">{row.roundsCompleted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
