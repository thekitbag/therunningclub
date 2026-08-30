import { CSRF_FIELD_NAME } from '@/lib/csrf';
import { getCsrfToken } from '@/lib/actions';

/**
 * Hidden CSRF field.
 *
 * Every admin form includes one. Because it is a server component that mints
 * the token as a side effect, adding a form without the field is a visible
 * omission rather than a silent security hole.
 */
export async function CsrfField() {
  const token = await getCsrfToken();
  return <input type="hidden" name={CSRF_FIELD_NAME} value={token} />;
}
