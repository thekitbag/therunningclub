/**
 * Service-layer errors.
 *
 * Each carries a message written for an administrator to read directly in a
 * form, and a machine-readable code so a caller can branch without matching on
 * prose. Nothing here should ever be surfaced to a public visitor.
 */

export type ServiceErrorCode =
  'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'RATE_LIMITED' | 'BLOCKED_BY_VALIDATION';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(code: ServiceErrorCode, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const notFound = (what: string) => new ServiceError('NOT_FOUND', `${what} was not found.`);

export const conflict = (message: string, fieldErrors?: Record<string, string>) =>
  new ServiceError('CONFLICT', message, fieldErrors);

export const validation = (message: string, fieldErrors?: Record<string, string>) =>
  new ServiceError('VALIDATION', message, fieldErrors);

/** Flattens a Zod error into a field-name to message map for form rendering. */
export function fieldErrorsFrom(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
