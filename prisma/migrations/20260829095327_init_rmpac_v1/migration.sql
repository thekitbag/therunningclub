-- CreateEnum
CREATE TYPE "AdministratorStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RunnerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED');

-- CreateEnum
CREATE TYPE "ScoringCategory" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "SeasonType" AS ENUM ('SUMMER', 'WINTER');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DistanceChoice" AS ENUM ('TWO_LAP', 'THREE_LAP');

-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateTable
CREATE TABLE "administrator" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "AdministratorStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT NOT NULL,
    "passwordAlgorithm" TEXT NOT NULL DEFAULT 'scrypt',
    "passwordParameters" JSONB NOT NULL,
    "passwordUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSignedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" UUID NOT NULL,
    "administratorId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "clientSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_password_reset" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "issuedById" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_reset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runner" (
    "id" UUID NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "category" "ScoringCategory" NOT NULL,
    "status" "RunnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "canonicalRunnerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_season" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "SeasonType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "clubYearLabel" TEXT NOT NULL,
    "twoLapMetres" INTEGER NOT NULL,
    "threeLapMetres" INTEGER NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "scoringRulesVersion" TEXT NOT NULL,
    "ageGradeVersion" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tt_season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_round" (
    "id" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tt_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_result" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "runnerId" UUID NOT NULL,
    "distanceChoice" "DistanceChoice" NOT NULL,
    "distanceMetres" INTEGER NOT NULL,
    "elapsedMilliseconds" INTEGER NOT NULL,
    "finishingPosition" INTEGER NOT NULL,
    "finishingPoints" INTEGER NOT NULL,
    "tiedOnTime" BOOLEAN NOT NULL DEFAULT false,
    "ageGradePercent" DECIMAL(8,5),
    "ageOnRoundDate" INTEGER,
    "previousResultId" UUID,
    "previousAgeGradePercent" DECIMAL(8,5),
    "previousRoundOrdinal" INTEGER,
    "improvement" DECIMAL(8,5),
    "improvementPosition" INTEGER,
    "improvementPoints" INTEGER NOT NULL DEFAULT 0,
    "roundTotal" INTEGER NOT NULL DEFAULT 0,
    "scoringRulesVersion" TEXT NOT NULL,
    "ageGradeVersion" TEXT NOT NULL,
    "calculationTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tt_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "scoringRulesVersion" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "championship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "locationName" TEXT,
    "address" TEXT,
    "mapUrl" TEXT,
    "distanceLabel" TEXT,
    "distanceMetres" INTEGER,
    "leagueName" TEXT,
    "entryInstructions" TEXT,
    "externalUrl" TEXT,
    "status" "RaceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isChampionshipQualifier" BOOLEAN NOT NULL DEFAULT false,
    "championshipId" UUID,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_result" (
    "id" UUID NOT NULL,
    "raceId" UUID NOT NULL,
    "runnerId" UUID NOT NULL,
    "category" "ScoringCategory" NOT NULL,
    "categoryPosition" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "scoringRulesVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "championship_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrator_email_key" ON "administrator"("email");

-- CreateIndex
CREATE INDEX "administrator_status_idx" ON "administrator"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_tokenHash_key" ON "admin_session"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_session_administratorId_idx" ON "admin_session"("administratorId");

-- CreateIndex
CREATE INDEX "admin_session_expiresAt_idx" ON "admin_session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_password_reset_tokenHash_key" ON "admin_password_reset"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_password_reset_subjectId_idx" ON "admin_password_reset"("subjectId");

-- CreateIndex
CREATE INDEX "runner_searchName_idx" ON "runner"("searchName");

-- CreateIndex
CREATE INDEX "runner_status_idx" ON "runner"("status");

-- CreateIndex
CREATE INDEX "runner_category_idx" ON "runner"("category");

-- CreateIndex
CREATE UNIQUE INDEX "tt_season_slug_key" ON "tt_season"("slug");

-- CreateIndex
CREATE INDEX "tt_season_state_idx" ON "tt_season"("state");

-- CreateIndex
CREATE INDEX "tt_season_startDate_idx" ON "tt_season"("startDate");

-- CreateIndex
CREATE INDEX "tt_round_seasonId_date_idx" ON "tt_round"("seasonId", "date");

-- CreateIndex
CREATE INDEX "tt_round_state_idx" ON "tt_round"("state");

-- CreateIndex
CREATE UNIQUE INDEX "tt_round_seasonId_ordinal_key" ON "tt_round"("seasonId", "ordinal");

-- CreateIndex
CREATE INDEX "tt_result_runnerId_idx" ON "tt_result"("runnerId");

-- CreateIndex
CREATE INDEX "tt_result_roundId_distanceChoice_idx" ON "tt_result"("roundId", "distanceChoice");

-- CreateIndex
CREATE UNIQUE INDEX "tt_result_roundId_runnerId_key" ON "tt_result"("roundId", "runnerId");

-- CreateIndex
CREATE UNIQUE INDEX "championship_year_key" ON "championship"("year");

-- CreateIndex
CREATE INDEX "championship_state_idx" ON "championship"("state");

-- CreateIndex
CREATE UNIQUE INDEX "race_slug_key" ON "race"("slug");

-- CreateIndex
CREATE INDEX "race_date_idx" ON "race"("date");

-- CreateIndex
CREATE INDEX "race_status_idx" ON "race"("status");

-- CreateIndex
CREATE INDEX "race_championshipId_idx" ON "race"("championshipId");

-- CreateIndex
CREATE INDEX "race_state_idx" ON "race"("state");

-- CreateIndex
CREATE INDEX "championship_result_runnerId_idx" ON "championship_result"("runnerId");

-- CreateIndex
CREATE INDEX "championship_result_raceId_category_idx" ON "championship_result"("raceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "championship_result_raceId_runnerId_key" ON "championship_result"("raceId", "runnerId");

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_idx" ON "audit_event"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_event_actorId_idx" ON "audit_event"("actorId");

-- CreateIndex
CREATE INDEX "audit_event_createdAt_idx" ON "audit_event"("createdAt");

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_password_reset" ADD CONSTRAINT "admin_password_reset_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_password_reset" ADD CONSTRAINT "admin_password_reset_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runner" ADD CONSTRAINT "runner_canonicalRunnerId_fkey" FOREIGN KEY ("canonicalRunnerId") REFERENCES "runner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_season" ADD CONSTRAINT "tt_season_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_round" ADD CONSTRAINT "tt_round_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "tt_season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_round" ADD CONSTRAINT "tt_round_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_result" ADD CONSTRAINT "tt_result_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "tt_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_result" ADD CONSTRAINT "tt_result_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "runner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship" ADD CONSTRAINT "championship_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "championship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race" ADD CONSTRAINT "race_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_result" ADD CONSTRAINT "championship_result_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_result" ADD CONSTRAINT "championship_result_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "runner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
