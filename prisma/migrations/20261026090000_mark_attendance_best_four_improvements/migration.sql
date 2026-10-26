-- V9 changes only attendance-season aggregation: every appearance point counts,
-- alongside the runner's four highest improvement-point scores. Per-round
-- derived values are unchanged, but their version metadata follows the season.
UPDATE "tt_season"
SET "scoringRulesVersion" = 'RMPAC_SCORING_V9'
WHERE "pointsMode" = 'ATTENDANCE_AND_IMPROVEMENT';

UPDATE "tt_result" AS result
SET "scoringRulesVersion" = 'RMPAC_SCORING_V9'
FROM "tt_round" AS round
JOIN "tt_season" AS season ON season."id" = round."seasonId"
WHERE result."roundId" = round."id"
  AND season."pointsMode" = 'ATTENDANCE_AND_IMPROVEMENT';
