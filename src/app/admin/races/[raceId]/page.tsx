import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActorOrRedirect } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { toDateInputValue } from '@/lib/dates';
import { CsrfField } from '@/components/admin/CsrfField';
import { RaceEditForm } from '../RaceForms';
import { ChampionshipPlacingsGrid } from './ChampionshipPlacingsGrid';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ raceId: string }> }) {
  const { raceId } = await params;
  const race = await prisma.race.findUnique({ where: { id: raceId }, select: { name: true } });
  return { title: race?.name ?? 'Race' };
}

export default async function RaceDetailPage({ params }: { params: Promise<{ raceId: string }> }) {
  await requireActorOrRedirect('/admin/races');
  const { raceId } = await params;

  const race = await prisma.race.findUnique({
    where: { id: raceId },
    include: {
      championship: { select: { id: true, year: true } },
      championshipResults: {
        include: { runner: { select: { id: true, givenName: true, familyName: true } } },
        orderBy: [{ category: 'asc' }, { categoryPosition: 'asc' }],
      },
    },
  });
  if (!race) notFound();

  const runners = await prisma.runner.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
    select: { id: true, givenName: true, familyName: true, category: true },
  });

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: '0.35rem' }}>
        <p className="eyebrow">
          <Link href="/admin/races">Races</Link>
        </p>
        <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase' }}>{race.name}</h1>
        <p className="muted">
          {race.state === 'PUBLISHED' ? 'Published' : 'Draft — not visible to the public'}
          {race.isChampionshipQualifier && race.championship
            ? ` · Championship qualifier for ${race.championship.year}`
            : ''}
        </p>
      </header>

      <RaceEditForm
        csrfField={<CsrfField />}
        values={{
          id: race.id,
          name: race.name,
          shortLabel: race.shortLabel,
          date: toDateInputValue(race.date),
          startTime: race.startTime ?? '',
          locationName: race.locationName ?? '',
          address: race.address ?? '',
          mapUrl: race.mapUrl ?? '',
          distanceLabel: race.distanceLabel ?? '',
          distanceMetres: race.distanceMetres ? String(race.distanceMetres) : '',
          leagueName: race.leagueName ?? '',
          entryInstructions: race.entryInstructions ?? '',
          externalUrl: race.externalUrl ?? '',
          status: race.status,
          isChampionshipQualifier: race.isChampionshipQualifier,
        }}
      />

      {race.isChampionshipQualifier ? (
        <ChampionshipPlacingsGrid
          raceId={race.id}
          csrfField={<CsrfField />}
          runners={runners.map((runner) => ({
            id: runner.id,
            label: `${runner.familyName}, ${runner.givenName}`,
            category: runner.category,
          }))}
          existing={race.championshipResults.map((result) => ({
            runnerId: result.runnerId,
            categoryPosition: String(result.categoryPosition),
          }))}
        />
      ) : (
        <div className="notice notice--info">
          <p>
            This race does not count towards the club championship. Tick the qualifier box above to
            record club placings for it.
          </p>
        </div>
      )}
    </div>
  );
}
