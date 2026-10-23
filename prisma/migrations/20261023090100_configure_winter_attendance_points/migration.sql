-- Winter 2026/27 was still entirely draft when the club adopted attendance
-- points. Published seasons keep their historical method unchanged.
UPDATE "tt_season" AS season
SET
  "pointsMode" = 'ATTENDANCE_AND_IMPROVEMENT',
  "scoringRulesVersion" = 'RMPAC_SCORING_V8'
WHERE
  (
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

-- All matching results are draft, so this makes the stored preview internally
-- consistent immediately on deploy. The application recalculates them again
-- from source inputs on the next edit or publication.
WITH ranked_appearances AS (
  SELECT
    result."id",
    ROW_NUMBER() OVER (
      PARTITION BY result."runnerId", round."seasonId"
      ORDER BY round."date", round."ordinal", round."id"
    )::INTEGER AS appearance_points
  FROM "tt_result" AS result
  JOIN "tt_round" AS round ON round."id" = result."roundId"
  JOIN "tt_season" AS season ON season."id" = round."seasonId"
  WHERE season."pointsMode" = 'ATTENDANCE_AND_IMPROVEMENT'
    AND NOT EXISTS (
      SELECT 1
      FROM "tt_round" AS published_round
      WHERE published_round."seasonId" = season."id"
        AND published_round."state" = 'PUBLISHED'
    )
)
UPDATE "tt_result" AS result
SET
  "finishingPoints" = 0,
  "appearancePoints" = ranked_appearances.appearance_points,
  "roundTotal" = ranked_appearances.appearance_points + result."improvementPoints",
  "scoringRulesVersion" = 'RMPAC_SCORING_V8',
  "calculationTrace" = COALESCE(result."calculationTrace", '{}'::JSONB) || JSONB_BUILD_OBJECT(
    'pointsMode', 'ATTENDANCE_AND_IMPROVEMENT',
    'appearancePoints', ranked_appearances.appearance_points
  )
FROM ranked_appearances
WHERE result."id" = ranked_appearances."id";
