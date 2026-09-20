-- ---------------------------------------------------------------------------
-- Club Championships 2026 — championship record and its 23 qualifying races.
--
-- Source: the club's "Club Championships 2026" fixture card (one panel per
-- month, yellow rows flagged as DRRL league races). Nothing here is invented
-- beyond the four points listed under CAVEATS.
--
-- Safe to run more than once. Races are matched on `slug`, the championship on
-- `year`. A second run refreshes the descriptive fields but deliberately leaves
-- `status` and `state` alone, so an administrator who has since cancelled a
-- race or unpublished it does not have that undone by a re-run.
--
-- Usage on Render:
--   psql "$RENDER_EXTERNAL_DATABASE_URL" -f club-championship-2026-races.sql
--
-- ---------------------------------------------------------------------------
-- CAVEATS — these are the only judgements made on the card's behalf
-- ---------------------------------------------------------------------------
--
-- 1. FIVE DATES ARE PLACEHOLDERS. The card says "TBC" for Weymouth Bay 10k,
--    Heron Half, Phil & Bonnie Bounder, Osprey 10k and the RMPAC Christmas TT.
--    `race.date` is NOT NULL, so each has been given the Sunday nearest its
--    position in the month's list, and carries "Date to be confirmed." in its
--    entry instructions, which is shown to visitors. Fix them in /admin/races
--    as they are announced. Every other date is exactly as printed.
--
-- 2. DISTANCES ARE ONLY SET WHERE THE NAME STATES ONE — "10k", "Half", "10m".
--    "Weymouth 10", "Wimborne 10", "Maiden Newton 10" and "May 5" are almost
--    certainly 10-mile and 5-mile races, but the card does not say so, so they
--    are left blank rather than guessed.
--
-- 3. YELLOW = DRRL. The card's yellow highlight is its "DRRL League Races" key,
--    so those eleven races get `leagueName = 'Dorset Road Race League'`.
--
-- 4. THE TWO AGE-GRADED OPTIONS ARE NOT LOADED. The key also lists "AgeGraded
--    Park Run" and "AgeGraded Marathon", which count towards the best-of-seven
--    but are not fixtures with a date or a venue. They cannot be modelled as a
--    `race` row without an invented date; they need a product decision first.
--
-- Both the championship and the races are created PUBLISHED, so they appear on
-- the public site immediately. Change 'PUBLISHED' to 'DRAFT' in the two INSERTs
-- below if you would rather check them over in /admin first.
-- ---------------------------------------------------------------------------

BEGIN;

-- The 2026 championship. `scoringRulesVersion` matches SCORING_RULES_VERSION in
-- src/domain/scoring/types.ts, which is what ensureChampionship() writes.
INSERT INTO championship (
  id, year, name, state, "scoringRulesVersion",
  "publishedAt", "publishedById", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid(), 2026, 'Club Championship 2026', 'PUBLISHED', 'RMPAC_SCORING_V2',
  now(),
  (SELECT id FROM administrator WHERE status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1),
  now(), now()
)
ON CONFLICT (year) DO UPDATE
  SET name = EXCLUDED.name,
      "updatedAt" = now();

-- The 23 fixtures, in card order: January through December, left to right.
WITH incoming (name, slug, short_label, race_date, distance_label, distance_metres, league_name, entry_instructions) AS (
  VALUES
    -- January
    ('Broadstone Qtr',        'broadstone-qtr-2026',        'BROADSTN',   DATE '2026-01-01', NULL::text,        NULL::int, 'Dorset Road Race League'::text, NULL::text),
    -- February
    ('Blackmore Vale',        'blackmore-vale-2026',        'BLACKMORE',  DATE '2026-02-01', NULL,              NULL,      'Dorset Road Race League', NULL),
    ('Portland Coastal 10k',  'portland-coastal-10k-2026',  'PC10K',      DATE '2026-02-08', '10 km',           10000,     NULL,                      NULL),
    ('Portland Coastal Half', 'portland-coastal-half-2026', 'PCHALF',     DATE '2026-02-08', 'Half marathon',   21097,     NULL,                      NULL),
    ('Lytchett 10m',          'lytchett-10m-2026',          'LYTCHETT',   DATE '2026-02-08', '10 miles',        16093,     'Dorset Road Race League', NULL),
    -- March
    ('Weymouth Bay 10k',      'weymouth-bay-10k-2026',      'WEYBAY10K',  DATE '2026-03-01', '10 km',           10000,     NULL,                      'Date to be confirmed.'),
    ('Weymouth Half',         'weymouth-half-2026',         'WEYHALF',    DATE '2026-03-15', 'Half marathon',   21097,     NULL,                      NULL),
    ('Bournemouth Bay Run',   'bournemouth-bay-run-2026',   'BOURNEBAY',  DATE '2026-03-22', NULL,              NULL,      'Dorset Road Race League', NULL),
    -- May
    ('Hardy''s Half',         'hardy-s-half-2026',          'HARDYHALF',  DATE '2026-05-10', 'Half marathon',   21097,     NULL,                      NULL),
    ('May 5',                 'may-5-2026',                 'MAY5',       DATE '2026-05-17', NULL,              NULL,      'Dorset Road Race League', NULL),
    ('Egdon Easy',            'egdon-easy-2026',            'EGDON',      DATE '2026-05-23', NULL,              NULL,      NULL,                      NULL),
    -- June
    ('Purbeck 10K',           'purbeck-10k-2026',           'PURBECK10K', DATE '2026-06-12', '10 km',           10000,     'Dorset Road Race League', NULL),
    ('Heron Half',            'heron-half-2026',            'HERONHALF',  DATE '2026-06-28', 'Half marathon',   21097,     NULL,                      'Date to be confirmed.'),
    -- July
    ('Maiden Newton 10',      'maiden-newton-10-2026',      'MAIDEN10',   DATE '2026-07-22', NULL,              NULL,      NULL,                      NULL),
    -- August
    ('Stur Half',             'stur-half-2026',             'STURHALF',   DATE '2026-08-02', 'Half marathon',   21097,     'Dorset Road Race League', NULL),
    -- September
    ('Phil & Bonnie Bounder', 'phil-bonnie-bounder-2026',   'PBBOUNDER',  DATE '2026-09-06', NULL,              NULL,      NULL,                      'Date to be confirmed.'),
    ('Round the Lakes',       'round-the-lakes-2026',       'RTLAKES',    DATE '2026-09-13', NULL,              NULL,      'Dorset Road Race League', NULL),
    ('Black Hill Run (PBTS)', 'black-hill-run-pbts-2026',   'BLACKHILL',  DATE '2026-09-20', NULL,              NULL,      NULL,                      NULL),
    -- October
    ('Weymouth 10',           'weymouth-10-2026',           'WEY10',      DATE '2026-10-18', NULL,              NULL,      'Dorset Road Race League', NULL),
    -- November
    ('Wimborne 10',           'wimborne-10-2026',           'WIMBORNE10', DATE '2026-11-15', NULL,              NULL,      'Dorset Road Race League', NULL),
    ('Boscombe 10K',          'boscombe-10k-2026',          'BOSCOMBE10', DATE '2026-11-22', '10 km',           10000,     'Dorset Road Race League', NULL),
    -- December
    ('Osprey 10k',            'osprey-10k-2026',            'OSPREY10K',  DATE '2026-12-06', '10 km',           10000,     NULL,                      'Date to be confirmed.'),
    ('RMPAC Christmas TT',    'rmpac-christmas-tt-2026',    'XMASTT',     DATE '2026-12-20', NULL,              NULL,      NULL,                      'Date to be confirmed.')
)
INSERT INTO race (
  id, name, slug, "shortLabel", date,
  "distanceLabel", "distanceMetres", "leagueName", "entryInstructions",
  status, "isChampionshipQualifier", "championshipId",
  state, "publishedAt", "publishedById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  i.name, i.slug, i.short_label, i.race_date,
  i.distance_label, i.distance_metres, i.league_name, i.entry_instructions,
  -- A fixture whose date has already passed is recorded as run, not scheduled.
  CASE WHEN i.race_date < CURRENT_DATE THEN 'COMPLETED' ELSE 'SCHEDULED' END::"RaceStatus",
  true,
  c.id,
  'PUBLISHED'::"PublicationState",
  now(),
  (SELECT id FROM administrator WHERE status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1),
  now(), now()
FROM incoming i
CROSS JOIN (SELECT id FROM championship WHERE year = 2026) c
ON CONFLICT (slug) DO UPDATE
  SET name                      = EXCLUDED.name,
      "shortLabel"              = EXCLUDED."shortLabel",
      date                      = EXCLUDED.date,
      "distanceLabel"           = EXCLUDED."distanceLabel",
      "distanceMetres"          = EXCLUDED."distanceMetres",
      "leagueName"              = EXCLUDED."leagueName",
      "entryInstructions"       = EXCLUDED."entryInstructions",
      "isChampionshipQualifier" = true,
      "championshipId"          = EXCLUDED."championshipId",
      "updatedAt"               = now();
      -- `status` and `state` are intentionally not refreshed here.

-- One audit line so the rows have a visible provenance in /admin.
INSERT INTO audit_event (id, "actorId", action, "entityType", "entityId", summary)
SELECT
  gen_random_uuid(), NULL, 'championship.races.imported', 'Championship', c.id::text,
  jsonb_build_object(
    'year', 2026,
    'source', 'Club Championships 2026 fixture card',
    'raceCount', (SELECT count(*) FROM race WHERE "championshipId" = c.id),
    'datesToConfirm', 5
  )
FROM championship c
WHERE c.year = 2026;

COMMIT;

-- Check: 23 rows, five of them flagged "Date to be confirmed."
SELECT to_char(r.date, 'YYYY-MM-DD') AS date,
       r.name,
       r."shortLabel",
       r.status,
       r.state,
       COALESCE(r."leagueName", '—') AS league,
       COALESCE(r."distanceLabel", '—') AS distance,
       COALESCE(r."entryInstructions", '') AS note
FROM race r
JOIN championship c ON c.id = r."championshipId"
WHERE c.year = 2026
ORDER BY r.date, r.name;
