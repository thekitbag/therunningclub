import { describe, expect, it } from 'vitest';
import { assertNoPrivateFields, toPublicRunner } from '../dto';

describe('toPublicRunner', () => {
  it('exposes only id, display name and category', () => {
    const runner = {
      id: 'runner-1',
      givenName: 'Alex',
      familyName: 'Stone',
      category: 'FEMALE' as const,
    };
    const dto = toPublicRunner(runner);

    expect(dto).toEqual({ id: 'runner-1', displayName: 'Alex Stone', category: 'FEMALE' });
    expect(Object.keys(dto)).toEqual(['id', 'displayName', 'category']);
  });

  it('never carries a date of birth through, even if one is present on the input', () => {
    const runner = {
      id: 'runner-1',
      givenName: 'Alex',
      familyName: 'Stone',
      category: 'MALE' as const,
      dateOfBirth: new Date('1986-01-01'),
      searchName: 'alex stone',
    };
    const dto = toPublicRunner(runner);

    expect('dateOfBirth' in dto).toBe(false);
    expect('searchName' in dto).toBe(false);
    expect(() => assertNoPrivateFields(dto)).not.toThrow();
  });
});

describe('assertNoPrivateFields', () => {
  it('passes a clean public payload', () => {
    expect(() =>
      assertNoPrivateFields({
        season: { name: 'Winter 2025/26', rounds: [{ id: 'r1', total: 12 }] },
      }),
    ).not.toThrow();
  });

  it('catches a private field nested anywhere', () => {
    expect(() => assertNoPrivateFields({ runner: { dateOfBirth: '1986-01-01' } })).toThrow(
      /dateOfBirth/,
    );
    expect(() => assertNoPrivateFields({ rows: [{ ok: 1 }, { passwordHash: 'x' }] })).toThrow(
      /passwordHash/,
    );
    expect(() => assertNoPrivateFields({ a: { b: { c: { tokenHash: 'x' } } } })).toThrow(
      /tokenHash/,
    );
  });

  it('catches a derived exact age', () => {
    // An exact age is as identifying as a birth date for this purpose.
    expect(() => assertNoPrivateFields({ result: { age: 41 } })).toThrow(/age/);
    expect(() => assertNoPrivateFields({ result: { ageOnRoundDate: 41 } })).toThrow(
      /ageOnRoundDate/,
    );
  });

  it('reports where the leak was found', () => {
    expect(() => assertNoPrivateFields({ rounds: [{ results: [{ dateOfBirth: 'x' }] }] })).toThrow(
      /\$\.rounds\[0\]\.results\[0\]/,
    );
  });

  it('tolerates dates, nulls and primitives', () => {
    expect(() =>
      assertNoPrivateFields({ at: new Date(), nothing: null, n: 1, s: 'x' }),
    ).not.toThrow();
  });
});
