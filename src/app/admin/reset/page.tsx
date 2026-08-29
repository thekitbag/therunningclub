import { CsrfField } from '@/components/admin/CsrfField';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Set a new password' };

/**
 * Completes an administrator-issued password reset.
 *
 * Unauthenticated by design: possession of a valid, unexpired, unused token is
 * the proof. The token is never validated here — doing so would reveal whether
 * it exists before the new password is even chosen — only when the form posts.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div style={{ maxWidth: '26rem', marginInline: 'auto' }} className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Set a new password</h1>
      </header>

      {token ? (
        <ResetForm token={token} csrfField={<CsrfField />} />
      ) : (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">No reset token</p>
          <p>This link is incomplete. Ask an administrator to issue you a new one.</p>
        </div>
      )}
    </div>
  );
}
