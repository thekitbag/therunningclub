/**
 * Competition ranking ("1224" ranking) shared by every table in the app.
 *
 * Ties keep the same position and the following entry skips the tied places, so
 * four runners can finish 1, 2, 2, 4. `scoring-rules.md` applies this to
 * finishing order, improvement order and championship placings alike, and v1
 * deliberately has no secondary tie-break.
 */

export interface RankedEntry<T> {
  readonly item: T;
  /** 1-based competition position. Tied items share a position. */
  readonly position: number;
  /** 0-based index in the sorted array. Distinct for every entry. */
  readonly sortedIndex: number;
  /** True when at least one other entry shares this position. */
  readonly tied: boolean;
}

/**
 * Ranks items best-first.
 *
 * `compare` must return a negative number when `a` ranks ahead of `b`, and
 * exactly `0` when the two are genuinely tied on the ranking key. Sorting is
 * stable, so equal entries keep their input order — which matters for
 * reproducible output, not for the points they receive.
 */
export function rankByCompetition<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
): RankedEntry<T>[] {
  const sorted = [...items].sort(compare);
  const ranked: RankedEntry<T>[] = [];

  let currentPosition = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index] as T;
    const previous = index > 0 ? (sorted[index - 1] as T) : undefined;
    const tiedWithPrevious = previous !== undefined && compare(previous, item) === 0;

    // A tie reuses the previous position; anything else takes the position
    // implied by how many entries came before it, which is what creates the gap.
    currentPosition = tiedWithPrevious ? currentPosition : index + 1;

    ranked.push({ item, position: currentPosition, sortedIndex: index, tied: false });
  }

  // Second pass: an entry is tied when any neighbour shares its position.
  const counts = new Map<number, number>();
  for (const entry of ranked) {
    counts.set(entry.position, (counts.get(entry.position) ?? 0) + 1);
  }

  return ranked.map((entry) => ({
    ...entry,
    tied: (counts.get(entry.position) ?? 0) > 1,
  }));
}

/** Ascending numeric comparison that treats near-identical floats as tied. */
export function compareNumbersDescending(epsilon = 0) {
  return (a: number, b: number): number => {
    const difference = b - a;
    return Math.abs(difference) <= epsilon ? 0 : difference;
  };
}
