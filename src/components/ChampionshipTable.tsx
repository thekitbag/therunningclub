import { Bib } from '@/components/Bib';
import type { PublicChampionshipRow } from '@/services/public-queries';
import { CHAMPIONSHIP_COUNTING_RACES } from '@/domain/scoring/types';

/**
 * Championship standings.
 *
 * Two things are easy to get wrong in this table and both are handled
 * explicitly: a missing race is a dash rather than a zero, and eligibility is
 * stated in words next to every runner rather than implied by a blank total.
 */
export function ChampionshipTable({
  rows,
  caption,
  races,
}: {
  rows: readonly PublicChampionshipRow[];
  caption: string;
  races: readonly { id: string; shortLabel: string; name: string }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="muted" style={{ padding: '1rem 0' }}>
        No results recorded in this category yet.
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
          {caption}. Lowest total wins. A shaded, bulleted score is one of the{' '}
          {CHAMPIONSHIP_COUNTING_RACES} that count. An em dash means the runner did not contest that
          race. Race column headings are abbreviations — the full race names are listed under the
          table.
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Runner</th>
            {races.map((race) => (
              <th key={race.id} scope="col" className="num">
                <abbr title={race.name}>{race.shortLabel}</abbr>
              </th>
            ))}
            <th scope="col" className="num nowrap">
              Best {CHAMPIONSHIP_COUNTING_RACES}
            </th>
            <th scope="col" className="nowrap">
              Status
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
                  tone={row.position === 1 ? 'purple' : 'quiet'}
                  size="sm"
                />
              </td>
              <th scope="row" style={{ fontWeight: 600 }} className="nowrap">
                {row.runner.displayName}
              </th>
              {row.races.map((race) => (
                <td key={race.raceId} className={`num${race.counts ? ' counts' : ''}`}>
                  {race.score === null ? (
                    <>
                      <span aria-hidden="true" className="absent">
                        —
                      </span>
                      <span className="visually-hidden">did not run</span>
                    </>
                  ) : (
                    <>
                      {race.tied ? '=' : ''}
                      {race.score}
                      {race.counts ? <span className="visually-hidden"> (counts)</span> : null}
                    </>
                  )}
                </td>
              ))}
              <td className="num" style={{ fontWeight: 800 }}>
                {row.countingTotal ?? (
                  <>
                    <span aria-hidden="true" className="absent">
                      —
                    </span>
                    <span className="visually-hidden">not yet eligible</span>
                  </>
                )}
              </td>
              <td className="nowrap">
                {row.eligible ? (
                  <span className="tag tag--green">✓ Eligible</span>
                ) : (
                  <span className="tag">
                    Not yet eligible · {row.racesCompleted} of {row.racesRequired}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
