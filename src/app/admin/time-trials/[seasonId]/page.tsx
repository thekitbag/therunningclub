import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { formatShortDate, toDateInputValue } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { RoundForms } from './RoundForms';
import { SeasonPointsModeForm } from './SeasonPointsModeForm';
import { ROUNDS_PER_SEASON } from '@/domain/scoring';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const season = await prisma.ttSeason.findUnique({
    where: { id: seasonId },
    select: { name: true },
  });
  return { title: season?.name ?? 'Season' };
}

export default async function SeasonAdminPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  await requireActorOrRedirect('/admin/time-trials');
  const { seasonId } = await params;

  const season = await prisma.ttSeason.findUnique({
    where: { id: seasonId },
    include: {
      rounds: {
        orderBy: { ordinal: 'asc' },
        include: { _count: { select: { results: true } } },
      },
    },
  });
  if (!season) notFound();

  const usedOrdinals = season.rounds.map((round) => round.ordinal);
  const nextOrdinal =
    Array.from({ length: ROUNDS_PER_SEASON }, (_, index) => index + 1).find(
      (ordinal) => !usedOrdinals.includes(ordinal),
    ) ?? null;

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">
          <Link href="/admin/time-trials">Time trials</Link>
        </p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>{season.name}</h1>
        <p className="muted">
          {formatShortDate(season.startDate)} – {formatShortDate(season.endDate)} · Two laps{' '}
          {season.twoLapMetres / 1000} km · Three laps {season.threeLapMetres / 1000} km ·{' '}
          {season.state === 'PUBLISHED' ? 'Published' : titleCase(season.state)}
        </p>
        <p className="muted">
          {season.pointsMode === 'ATTENDANCE_AND_IMPROVEMENT'
            ? 'All appearance points + best four improvement scores'
            : season.pointsMode === 'IMPROVEMENT_ONLY'
              ? 'Improvement points only · best four count'
              : 'Finishing and improvement points · best four count'}
        </p>
      </header>

      <SeasonPointsModeForm
        seasonId={season.id}
        pointsMode={season.pointsMode}
        locked={season.rounds.some((round) => round.state === 'PUBLISHED')}
        csrfField={<CsrfField />}
      />

      <RoundForms
        seasonId={season.id}
        nextOrdinal={nextOrdinal}
        csrfField={<CsrfField />}
        csrfFieldEdit={<CsrfField />}
        rounds={season.rounds.map((round) => ({
          id: round.id,
          ordinal: round.ordinal,
          name: round.name,
          date: toDateInputValue(round.date),
          displayDate: formatShortDate(round.date),
          state: round.state,
          resultCount: round._count.results,
        }))}
      />
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
