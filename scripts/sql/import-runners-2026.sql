-- ---------------------------------------------------------------------------
-- The 30 runners on the RMPAC Summer Time Trial 2026 results sheet.
--
-- Source: "RMPAC Summer Time Trial Results - 25 August 2026" (2 pages).
--   Page 1 — the 25 August round as run (13 two-lap, 4 three-lap).
--   Page 2 — the season-to-date table, April to September.
-- Same sheet that scripts/seed-club-2026.ts was built from; the names and
-- scoring categories here are taken from that file so the two agree.
--
-- Safe to run more than once. `runner` has no unique constraint on the name —
-- deliberately, since two real members can share one — so each row is guarded
-- by NOT EXISTS on `searchName` instead of ON CONFLICT. A second run inserts
-- nothing and changes nothing.
--
-- Usage on Render:
--   psql "<external connection string>" -v ON_ERROR_STOP=1 -f import-runners-2026.sql
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE PUBLISHING ANY AGE GRADE
-- ---------------------------------------------------------------------------
--
-- EVERY DATE OF BIRTH BELOW IS INVENTED. The results sheet does not carry
-- them, and `runner.dateOfBirth` is NOT NULL. They were chosen to be plausible
-- for a running club (ages 26 to 66 at August 2026, all comfortably inside the
-- WMA table range of 5 to 100) and nothing more.
--
-- The consequence is narrow but real:
--   * AGE-GRADE PERCENTAGES DERIVED FROM THESE DATES ARE FICTION. They are not
--     the club's age grades. The public season and round pages show them.
--   * Improvement points are still meaningful in ordering — a runner is only
--     ever compared with their own earlier result at the same distance, and a
--     wrong-but-constant birth date cancels out of that comparison.
--   * Finishing points, round totals and best-four standings are unaffected;
--     they depend only on elapsed time.
--
-- So that the fabrication cannot quietly become "the data", every invented
-- date falls on the FIRST OF A MONTH. To see what still needs correcting:
--
--   SELECT "givenName", "familyName", "dateOfBirth"
--   FROM runner
--   WHERE EXTRACT(DAY FROM "dateOfBirth") = 1
--   ORDER BY "familyName";
--
-- Correct them in /admin/runners as the real dates come in. Editing a runner
-- there recalculates every season they appear in, so the age grades repair
-- themselves; no further SQL is needed.
--
-- ---------------------------------------------------------------------------
-- ONE OTHER THING TO CHECK
-- ---------------------------------------------------------------------------
--
-- Scoring category drives which WMA table a result is graded against, so a
-- wrong one is a wrong age grade. Nineteen categories come from the club's own
-- 2025 championship sheet ('championship-2025' in the `source` column below).
-- ELEVEN WERE INFERRED FROM A FIRST NAME ALONE and want a human's eye:
--   Nick Bearman, Debbie Cain, John Chester, Tracy Christie, Melissa Eryilmaz,
--   Chris Ginifer, Mark Gray, Damian Hayward, Ellie Makin, Nikki Morris,
--   Jules Stout, Warren Taylor, Jim Young.
-- ---------------------------------------------------------------------------

BEGIN;

WITH incoming (given_name, family_name, date_of_birth, category, source) AS (
  VALUES
    ('Darren',  'Askew',       DATE '1978-03-01', 'MALE',   'championship-2025'),
    ('Nick',    'Bearman',     DATE '1985-07-01', 'MALE',   'name'),
    ('Pete',    'Bell',        DATE '1969-11-01', 'MALE',   'championship-2025'),
    ('Debbie',  'Cain',        DATE '1974-05-01', 'FEMALE', 'name'),
    ('John',    'Chester',     DATE '1966-09-01', 'MALE',   'name'),
    ('Tracy',   'Christie',    DATE '1979-02-01', 'FEMALE', 'name'),
    ('Jack',    'Creighton',   DATE '1996-04-01', 'MALE',   'championship-2025'),
    ('Salah',   'Dahir',       DATE '1990-08-01', 'MALE',   'championship-2025'),
    ('Andy',    'DeHavilland', DATE '1972-12-01', 'MALE',   'championship-2025'),
    ('Jon',     'Dunk',        DATE '1981-06-01', 'MALE',   'championship-2025'),
    ('Melissa', 'Eryilmaz',    DATE '1988-10-01', 'FEMALE', 'name'),
    ('Chris',   'Ginifer',     DATE '1976-01-01', 'MALE',   'name'),
    ('Mark',    'Gray',        DATE '1971-03-01', 'MALE',   'name'),
    ('Gary',    'Haylock',     DATE '1964-07-01', 'MALE',   'championship-2025'),
    ('Damian',  'Hayward',     DATE '1983-05-01', 'MALE',   'name'),
    ('Laura',   'Last',        DATE '1992-09-01', 'FEMALE', 'championship-2025'),
    ('Liz',     'Lewis',       DATE '1968-02-01', 'FEMALE', 'championship-2025'),
    ('Ellie',   'Makin',       DATE '1998-11-01', 'FEMALE', 'name'),
    ('Darren',  'Mills',       DATE '1977-04-01', 'MALE',   'championship-2025'),
    ('Nikki',   'Morris',      DATE '1986-08-01', 'FEMALE', 'name'),
    ('Jerry',   'Packer',      DATE '1962-12-01', 'MALE',   'championship-2025'),
    ('Laura',   'Pearson',     DATE '1980-06-01', 'FEMALE', 'championship-2025'),
    ('Stu',     'Pearson',     DATE '1975-10-01', 'MALE',   'championship-2025'),
    ('Mark',    'Salmon',      DATE '1973-01-01', 'MALE',   'championship-2025'),
    ('Jules',   'Stout',       DATE '1987-03-01', 'MALE',   'name'),
    ('Warren',  'Taylor',      DATE '1970-07-01', 'MALE',   'name'),
    ('Callum',  'Underwood',   DATE '2000-05-01', 'MALE',   'championship-2025'),
    ('Steve',   'White',       DATE '1959-09-01', 'MALE',   'championship-2025'),
    ('Pete',    'Wiles',       DATE '1965-02-01', 'MALE',   'championship-2025'),
    ('Jim',     'Young',       DATE '1994-04-01', 'MALE',   'name')
),

-- Must match normaliseSearchName() in src/services/runners.ts, or duplicate
-- detection and admin search will not find these rows. Every name on the sheet
-- is plain ASCII, so lower-casing and collapsing spaces is enough.
prepared AS (
  SELECT i.*,
         regexp_replace(
           regexp_replace(lower(i.given_name || ' ' || i.family_name), '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g'
         ) AS search_name
  FROM incoming i
),

inserted AS (
  INSERT INTO runner (
    id, "givenName", "familyName", "searchName",
    "dateOfBirth", category, status, "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid(),
    p.given_name, p.family_name, p.search_name,
    p.date_of_birth,
    p.category::"ScoringCategory",
    'ACTIVE'::"RunnerStatus",
    now(), now()
  FROM prepared p
  WHERE NOT EXISTS (
    SELECT 1 FROM runner r
    WHERE r."searchName" = p.search_name
      AND r.status <> 'MERGED'
  )
  RETURNING id
)

-- Provenance, so the invented birth dates are on the record and not a surprise
-- to whoever next looks at an age grade and wonders why it reads oddly. Skipped
-- entirely when a re-run inserts nothing, so re-running adds no noise.
INSERT INTO audit_event (id, "actorId", action, "entityType", "entityId", summary)
SELECT
  gen_random_uuid(), NULL, 'runner.imported', 'Runner', NULL,
  jsonb_build_object(
    'source', 'RMPAC Summer Time Trial Results - 25 August 2026',
    'runnersOnSheet', 30,
    'runnersInserted', (SELECT count(*) FROM inserted),
    'datesOfBirth', 'INVENTED - every one falls on the 1st of a month; age grades derived from them are not real',
    'categoriesInferredFromFirstName', 13
  )
WHERE (SELECT count(*) FROM inserted) > 0;

COMMIT;

-- Check: 30 rows, every date of birth on the 1st and so still to be corrected.
SELECT r."givenName" || ' ' || r."familyName" AS runner,
       r.category,
       to_char(r."dateOfBirth", 'YYYY-MM-DD') AS date_of_birth,
       EXTRACT(YEAR FROM age(DATE '2026-08-25', r."dateOfBirth"))::int AS age_at_august_round,
       CASE WHEN EXTRACT(DAY FROM r."dateOfBirth") = 1 THEN 'invented' ELSE 'confirmed' END AS dob_status
FROM runner r
ORDER BY r."familyName", r."givenName";
