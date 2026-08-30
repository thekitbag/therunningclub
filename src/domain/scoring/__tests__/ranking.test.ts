import { describe, expect, it } from 'vitest';
import { rankByCompetition } from '../ranking';

const ascending = (a: number, b: number) => a - b;

describe('rankByCompetition', () => {
  it('numbers a strict order 1, 2, 3', () => {
    const ranked = rankByCompetition([3, 1, 2], ascending);
    expect(ranked.map((r) => [r.item, r.position])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('shares a position on a tie and skips the places consumed', () => {
    const ranked = rankByCompetition([1, 2, 2, 4], ascending);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 2, 4]);
  });

  it('handles a tie at the front', () => {
    const ranked = rankByCompetition([1, 1, 3], ascending);
    expect(ranked.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it('handles three-way and trailing ties', () => {
    expect(rankByCompetition([1, 1, 1, 4], ascending).map((r) => r.position)).toEqual([1, 1, 1, 4]);
    expect(rankByCompetition([1, 2, 2], ascending).map((r) => r.position)).toEqual([1, 2, 2]);
  });

  it('flags which entries are tied', () => {
    const ranked = rankByCompetition([1, 2, 2, 4], ascending);
    expect(ranked.map((r) => r.tied)).toEqual([false, true, true, false]);
  });

  it('returns an empty ranking for an empty field', () => {
    expect(rankByCompetition([], ascending)).toEqual([]);
  });

  it('is stable, so equal entries keep their input order', () => {
    const items = [
      { id: 'a', key: 1 },
      { id: 'b', key: 1 },
      { id: 'c', key: 0 },
    ];
    const ranked = rankByCompetition(items, (x, y) => x.key - y.key);
    expect(ranked.map((r) => r.item.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    rankByCompetition(input, ascending);
    expect(input).toEqual([3, 1, 2]);
  });
});
