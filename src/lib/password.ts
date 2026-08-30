import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// `promisify` cannot preserve the overload that accepts options, so the
// options-taking signature is restored explicitly.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with Node's built-in scrypt.
 *
 * The technical specification allows Argon2id or scrypt with documented
 * parameters. scrypt is chosen because it needs no native module, which keeps
 * the Render build reproducible and removes a compilation failure mode from
 * deployment. It is a memory-hard KDF, so it satisfies the requirement never to
 * use a fast general-purpose hash.
 *
 * Parameters (OWASP-recommended minimum for scrypt, exceeded here):
 *   N = 2^16 (65536) iterations, r = 8, p = 1  ->  ~64 MiB of memory per hash.
 * `maxmem` must be raised explicitly because Node's 32 MiB default would reject
 * these parameters.
 *
 * The parameters are stored per record, so raising the cost later re-hashes
 * gradually on sign-in instead of invalidating every existing password.
 */
export interface ScryptParameters {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: number;
}

export const CURRENT_SCRYPT_PARAMETERS: ScryptParameters = {
  N: 65536,
  r: 8,
  p: 1,
  keyLength: 64,
};

const SALT_BYTES = 16;

function maxmemFor(parameters: ScryptParameters): number {
  // Node requires maxmem > 128 * N * r; a 2x margin keeps it comfortable.
  return 256 * parameters.N * parameters.r;
}

export interface StoredPassword {
  readonly hash: string;
  readonly parameters: ScryptParameters & { readonly salt: string };
}

export async function hashPassword(
  plaintext: string,
  parameters: ScryptParameters = CURRENT_SCRYPT_PARAMETERS,
): Promise<StoredPassword> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plaintext.normalize('NFKC'), salt, parameters.keyLength, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: maxmemFor(parameters),
  });

  return {
    hash: derived.toString('base64'),
    parameters: { ...parameters, salt: salt.toString('base64') },
  };
}

/**
 * Verifies a password in constant time.
 *
 * Returns false rather than throwing on malformed stored parameters, so a
 * corrupted row cannot be distinguished from a wrong password by timing or by
 * error message.
 */
export async function verifyPassword(
  plaintext: string,
  stored: { hash: string; parameters: unknown },
): Promise<boolean> {
  const parameters = parseParameters(stored.parameters);
  if (!parameters) return false;

  try {
    const salt = Buffer.from(parameters.salt, 'base64');
    const expected = Buffer.from(stored.hash, 'base64');
    const derived = await scrypt(plaintext.normalize('NFKC'), salt, parameters.keyLength, {
      N: parameters.N,
      r: parameters.r,
      p: parameters.p,
      maxmem: maxmemFor(parameters),
    });

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash used weaker parameters than the current policy. */
export function needsRehash(stored: { parameters: unknown }): boolean {
  const parameters = parseParameters(stored.parameters);
  if (!parameters) return true;
  return (
    parameters.N < CURRENT_SCRYPT_PARAMETERS.N ||
    parameters.r < CURRENT_SCRYPT_PARAMETERS.r ||
    parameters.keyLength < CURRENT_SCRYPT_PARAMETERS.keyLength
  );
}

function parseParameters(value: unknown): (ScryptParameters & { salt: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const { N, r, p, keyLength, salt } = candidate;
  if (
    typeof N !== 'number' ||
    typeof r !== 'number' ||
    typeof p !== 'number' ||
    typeof keyLength !== 'number' ||
    typeof salt !== 'string'
  ) {
    return null;
  }
  return { N, r, p, keyLength, salt };
}

/**
 * Converts stored parameters to a plain JSON object.
 *
 * Prisma's `Json` input type requires an index signature, which a readonly
 * interface does not provide; naming the fields here also documents exactly
 * what is persisted alongside the hash.
 */
export function storedParametersToJson(
  parameters: StoredPassword['parameters'],
): Record<string, string | number> {
  return {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    keyLength: parameters.keyLength,
    salt: parameters.salt,
  };
}

// The policy itself lives in `password-policy.ts` so client components can
// import it without pulling Node built-ins into the browser bundle.
export { MINIMUM_PASSWORD_LENGTH, validatePasswordStrength } from './password-policy';
