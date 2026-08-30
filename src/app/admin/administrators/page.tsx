import { requireActorOrRedirect } from '@/lib/authz';
import { formatTimestamp } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { listAdministrators } from '@/services/administrators';
import { AdministratorForms } from './AdministratorForms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Administrators' };

export default async function AdministratorsPage() {
  const actor = await requireActorOrRedirect('/admin/administrators');
  const administrators = await listAdministrators();

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Administrators</h1>
        <p className="muted">
          Everyone who maintains results has their own account. There is no shared password and no
          public sign-up.
        </p>
      </header>

      <AdministratorForms
        currentActorId={actor.id}
        csrfCreate={<CsrfField />}
        csrfStatus={<CsrfField />}
        csrfReset={<CsrfField />}
        administrators={administrators.map((administrator) => ({
          id: administrator.id,
          email: administrator.email,
          displayName: administrator.displayName,
          status: administrator.status,
          activeSessions: administrator._count.sessions,
          lastSignedInAt: administrator.lastSignedInAt
            ? formatTimestamp(administrator.lastSignedInAt)
            : null,
        }))}
      />
    </div>
  );
}
