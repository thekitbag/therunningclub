-- CreateEnum
CREATE TYPE "TimeTrialPointsMode" AS ENUM (
    'FINISHING_AND_IMPROVEMENT',
    'IMPROVEMENT_ONLY'
);

-- Existing seasons, including Summer 2026, retain their original combined
-- scoring. The default also makes this migration safe for any concurrently
-- created season.
ALTER TABLE "tt_season"
ADD COLUMN "pointsMode" "TimeTrialPointsMode" NOT NULL
DEFAULT 'FINISHING_AND_IMPROVEMENT';

-- Winter 2026/27 adopted an improvement-only leaderboard before its first
-- round was published. The published-round guard prevents an unexpected
-- historical rewrite if production data no longer matches that assumption.
UPDATE "tt_season" AS season
SET "pointsMode" = 'IMPROVEMENT_ONLY'
WHERE (
      season."slug" = 'winter-2026-27'
      OR (
          season."type" = 'WINTER'
          AND season."startDate" = DATE '2026-10-01'
          AND season."endDate" = DATE '2027-03-31'
      )
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "tt_round" AS round
      WHERE round."seasonId" = season."id"
        AND round."state" = 'PUBLISHED'
  );
