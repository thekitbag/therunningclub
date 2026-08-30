/**
 * Password policy constants and rules.
 *
 * Deliberately separate from `password.ts`, which imports `node:crypto` and
 * `node:util`. Admin forms need the minimum length to render their field hints,
 * and importing it from the hashing module would drag Node built-ins into the
 * browser bundle — which crashes the page at runtime. Nothing in this file may
 * import a Node built-in.
 */

/**
 * Minimum password length for administrator accounts.
 *
 * Length is the dominant factor for a hashed credential, so the rule is a long
 * minimum rather than a composition rule that pushes people towards `P@ssw0rd!`.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;

export function validatePasswordStrength(plaintext: string): string[] {
  const problems: string[] = [];
  if (plaintext.length < MINIMUM_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }
  if (plaintext.trim().length !== plaintext.length) {
    problems.push('Password must not begin or end with a space.');
  }
  if (/^(.)\1+$/.test(plaintext)) {
    problems.push('Password must not be a single repeated character.');
  }
  return problems;
}
