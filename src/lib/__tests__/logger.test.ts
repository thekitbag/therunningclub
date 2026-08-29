import { describe, expect, it } from 'vitest';
import { redact } from '../logger';

describe('redact', () => {
  it('removes credentials and personal data by field name', () => {
    const redacted = redact({
      email: 'admin@example.com',
      password: 'hunter2',
      passwordHash: 'abc',
      token: 'xyz',
      dateOfBirth: '1986-01-01',
      sessionToken: 'zzz',
    }) as Record<string, unknown>;

    expect(redacted.email).toBe('admin@example.com');
    expect(redacted.password).toBe('[redacted]');
    expect(redacted.passwordHash).toBe('[redacted]');
    expect(redacted.token).toBe('[redacted]');
    expect(redacted.dateOfBirth).toBe('[redacted]');
    expect(redacted.sessionToken).toBe('[redacted]');
  });

  it('matches field names regardless of case, underscores or hyphens', () => {
    const redacted = redact({
      Password: 'a',
      date_of_birth: 'b',
      'session-token': 'c',
      CSRFToken: 'd',
    }) as Record<string, unknown>;

    expect(Object.values(redacted)).toEqual([
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
    ]);
  });

  it('reaches into nested objects and arrays', () => {
    const redacted = redact({
      actor: { id: '1', password: 'secret' },
      runners: [{ name: 'A', dob: '1990-01-01' }],
    }) as Record<string, Record<string, unknown>>;

    expect(redacted.actor?.password).toBe('[redacted]');
    expect((redacted.runners as unknown as Record<string, unknown>[])[0]?.dob).toBe('[redacted]');
  });

  it('summarises errors without leaking a stack trace', () => {
    const redacted = redact(new Error('boom')) as Record<string, unknown>;
    expect(redacted).toEqual({ name: 'Error', message: 'boom' });
    expect('stack' in redacted).toBe(false);
  });

  it('stops recursing on deeply nested input', () => {
    let nested: Record<string, unknown> = { password: 'x' };
    for (let i = 0; i < 20; i += 1) nested = { child: nested };
    expect(() => redact(nested)).not.toThrow();
    expect(JSON.stringify(redact(nested))).toContain('[truncated]');
  });

  it('caps very long arrays', () => {
    const redacted = redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(redacted).toHaveLength(50);
  });
});
