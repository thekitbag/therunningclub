import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCRYPT_PARAMETERS,
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from '../password';

describe('hashPassword / verifyPassword', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse battery staple', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('produces a different hash each time, so the salt is really random', async () => {
    const a = await hashPassword('the same password');
    const b = await hashPassword('the same password');
    expect(a.hash).not.toBe(b.hash);
    expect(a.parameters.salt).not.toBe(b.parameters.salt);
    // Both still verify, which is the point of a per-record salt.
    await expect(verifyPassword('the same password', a)).resolves.toBe(true);
    await expect(verifyPassword('the same password', b)).resolves.toBe(true);
  });

  it('never stores the plaintext', async () => {
    const stored = await hashPassword('super secret value');
    expect(stored.hash).not.toContain('super secret value');
    expect(JSON.stringify(stored)).not.toContain('super secret value');
  });

  it('uses memory-hard parameters rather than a fast hash', () => {
    expect(CURRENT_SCRYPT_PARAMETERS.N).toBeGreaterThanOrEqual(65536);
    expect(CURRENT_SCRYPT_PARAMETERS.r).toBeGreaterThanOrEqual(8);
    expect(CURRENT_SCRYPT_PARAMETERS.keyLength).toBeGreaterThanOrEqual(64);
  });

  it('normalises unicode so a re-typed password still verifies', async () => {
    // "é" composed vs decomposed: visually identical, different bytes.
    const stored = await hashPassword('passé-phrase-long');
    await expect(verifyPassword('passé-phrase-long', stored)).resolves.toBe(true);
  });

  it('returns false rather than throwing on corrupted stored parameters', async () => {
    await expect(verifyPassword('anything', { hash: 'x', parameters: null })).resolves.toBe(false);
    await expect(
      verifyPassword('anything', { hash: 'x', parameters: { N: 'nope' } }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('anything', {
        hash: 'not-base64!!',
        parameters: { N: 2, r: 1, p: 1, keyLength: 8, salt: 'AA' },
      }),
    ).resolves.toBe(false);
  });
});

describe('needsRehash', () => {
  it('flags parameters weaker than current policy', () => {
    expect(needsRehash({ parameters: { N: 1024, r: 8, p: 1, keyLength: 64, salt: 'AA' } })).toBe(
      true,
    );
    expect(needsRehash({ parameters: { ...CURRENT_SCRYPT_PARAMETERS, salt: 'AA' } })).toBe(false);
    expect(needsRehash({ parameters: null })).toBe(true);
  });
});

describe('validatePasswordStrength', () => {
  it('requires a long password', () => {
    expect(validatePasswordStrength('short')).toContainEqual(
      expect.stringContaining('at least 12 characters'),
    );
    expect(validatePasswordStrength('a-perfectly-fine-passphrase')).toEqual([]);
  });

  it('rejects padding and repetition', () => {
    expect(validatePasswordStrength(' leading-space-pass ')).toContainEqual(
      expect.stringContaining('begin or end with a space'),
    );
    expect(validatePasswordStrength('aaaaaaaaaaaaaaa')).toContainEqual(
      expect.stringContaining('single repeated character'),
    );
  });
});
