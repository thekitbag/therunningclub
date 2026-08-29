import type { PublicRunner } from '@/lib/dto';

interface ProgressionEntry {
  readonly runner: PublicRunner;
  readonly points: readonly { ordinal: number; ageGradePercent: number | null }[];
}

/**
 * Age-grade progression across a season.
 *
 * Rendered as an accessible table with an inline sparkline per runner rather
 * than as a single chart: a chart of thirty overlapping lines is unreadable,
 * and the table underneath is the accessible representation of the same data.
 */
export function ProgressionChart({ entries }: { entries: readonly ProgressionEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted">No age-grade history yet for this season.</p>;
  }

  const values = entries.flatMap((entry) =>
    entry.points
      .map((point) => point.ageGradePercent)
      .filter((value): value is number => value !== null),
  );
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const span = Math.max(max - min, 1);
  const ordinals = entries[0]?.points.map((point) => point.ordinal) ?? [];

  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Age-grade progression — scrollable table"
    >
      <table>
        <caption>
          Age-grade percentage by round. Higher is better. The small chart in each row is a
          decorative summary of the numbers beside it.
        </caption>
        <thead>
          <tr>
            <th scope="col">Runner</th>
            <th scope="col">Trend</th>
            {ordinals.map((ordinal) => (
              <th key={ordinal} scope="col" className="num">
                <abbr title={`Round ${ordinal}`}>R{ordinal}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.runner.id}>
              <th scope="row" style={{ fontWeight: 600 }} className="nowrap">
                {entry.runner.displayName}
              </th>
              <td>
                <Sparkline points={entry.points} min={min} span={span} />
              </td>
              {entry.points.map((point) => (
                <td key={point.ordinal} className="num">
                  {point.ageGradePercent === null ? (
                    <>
                      <span aria-hidden="true" className="absent">
                        —
                      </span>
                      <span className="visually-hidden">did not run</span>
                    </>
                  ) : (
                    `${point.ageGradePercent.toFixed(2)}%`
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sparkline({
  points,
  min,
  span,
}: {
  points: readonly { ordinal: number; ageGradePercent: number | null }[];
  min: number;
  span: number;
}) {
  const width = 88;
  const height = 26;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const plotted = points
    .map((point, index) =>
      point.ageGradePercent === null
        ? null
        : {
            x: index * step,
            y: height - ((point.ageGradePercent - min) / span) * height,
          },
    )
    .filter((point): point is { x: number; y: number } => point !== null);

  if (plotted.length < 2) {
    return (
      <span className="muted" aria-hidden="true">
        —
      </span>
    );
  }

  const path = plotted
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--green)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {plotted.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r="2" fill="var(--purple)" />
      ))}
    </svg>
  );
}
