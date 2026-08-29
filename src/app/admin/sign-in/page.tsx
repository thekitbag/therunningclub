import { redirect } from 'next/navigation';
import { CsrfField } from '@/components/admin/CsrfField';
import { SignInForm } from './SignInForm';
import { getCurrentActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const actor = await getCurrentActor();
  if (actor) redirect('/admin');

  const { next, reset } = await searchParams;
  // Only ever redirect to a path inside the admin area, so an attacker cannot
  // craft a sign-in link that bounces a volunteer to another site afterwards.
  const safeNext = next && next.startsWith('/admin') ? next : '/admin';

  return (
    <div style={{ maxWidth: '26rem', marginInline: 'auto' }} className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Sign in</h1>
        <p className="muted">
          Administrator accounts are created by another administrator. There is no public sign-up.
        </p>
      </header>

      {reset === 'done' ? (
        <div className="notice notice--info" role="status">
          <p className="notice__title">Password changed</p>
          <p>Sign in with your new password.</p>
        </div>
      ) : null}

      <SignInForm next={safeNext} csrfField={<CsrfField />} />
    </div>
  );
}
