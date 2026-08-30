import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { listRunners } from '@/services/runners';
import { CsrfField } from '@/components/admin/CsrfField';
import { RunnerForms } from './RunnerForms';
import { toDateInputValue } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Runners' };

/**
 * Runner management.
 *
 * Dates of birth are shown here — this is an authenticated page and the value
 * has to be editable — but they never leave this boundary: no public query
 * selects the column, and the admin response is marked `private, no-store`.
 */
export default async function RunnersPage() {
  await requireActorOrRedirect('/admin/runners');

  const [runners, editableRunners] = await Promise.all([
    listRunners({ includeInactive: true }),
    prisma.runner.findMany({
      where: { status: { not: 'MERGED' } },
      orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
      select: {
        id: true,
        givenName: true,
        familyName: true,
        dateOfBirth: true,
        category: true,
        status: true,
      },
    }),
  ]);

  const editable = editableRunners.map((runner) => ({
    id: runner.id,
    givenName: runner.givenName,
    familyName: runner.familyName,
    dateOfBirth: toDateInputValue(runner.dateOfBirth),
    category: runner.category,
    status: runner.status as 'ACTIVE' | 'INACTIVE',
  }));

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">Club administration</p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>Runners</h1>
        <p className="muted">
          Dates of birth are used only to calculate age grades. They are never published, sent to a
          public page, cached offline or written to a log.
        </p>
      </header>

      <RunnerForms
        runners={runners}
        editable={editable}
        csrfField={<CsrfField />}
        csrfFieldEdit={<CsrfField />}
        csrfFieldMerge={<CsrfField />}
      />
    </div>
  );
}
