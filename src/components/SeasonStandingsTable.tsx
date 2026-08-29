import { Bib } from '@/components/Bib';
import type { PublicStandingRow } from '@/services/public-queries';

/**
 * Best-four season leaderboard.
 *
 * Scrolls horizontally on a phone rather than shrinking below readable size.
 * A round the runner missed shows an em dash, never a zero — conflating the two
 * would misrepresent both the runner and the standings.
 */
export function SeasonStandingsTable({
  rows,
  caption,
  roundOrdinals,
}: {
  rows: readonly PublicStandingRow[];
  caption: string;
  roundOrdinals: readonly number[];
}) {
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
          {caption}. A shaded, bulleted score is one of the four that count towards the total. An em
          dash means the runner did not run that round.
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Runner</th>
            {roundOrdinals.map((ordinal) => (
              <th key={ordinal} scope="col" className="num">
                <abbr title={`Round ${ordinal}`}>R{ordinal}</abbr>
              </th>
            ))}
            <th scope="col" className="num nowrap">
              Best 4
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
                  ) : (
                    <>
                      {round.total}
                      {round.counts ? <span className="visually-hidden"> (counts)</span> : null}
                    </>
                  )}
                </td>
              ))}
              <td className="num" style={{ fontWeight: 800 }}>
                {row.bestFourTotal}
              </td>
              <td className="num">{row.roundsCompleted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
