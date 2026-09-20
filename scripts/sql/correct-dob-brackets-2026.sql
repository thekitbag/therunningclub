-- ===========================================================================
-- SUPERSEDED - DO NOT RUN. Kept only as a record of how the brackets were
-- derived before the club supplied its member roster.
--
-- scripts/sql/sync-member-roster-2026.sql now applies REAL dates of birth.
-- Running this script after it would replace three runners' real dates with
-- invented ones, because their real dates fall just outside the windows the
-- race results implied. All three are explained by the DRRL categorising on age
-- reached during the calendar year rather than age on race day, so those
-- windows ended a little too early.
--
-- The real dates are deliberately not quoted here: this repository is public
-- and `runner.dateOfBirth` is private. The guard below makes the script a
-- no-op.
-- ===========================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'correct-dob-brackets-2026.sql is superseded by sync-member-roster-2026.sql. %',
    'Running it would overwrite real dates of birth with invented ones.';
END
$$;

-- ---------------------------------------------------------------------------
-- Correct the invented dates of birth to the age category the runner actually
-- raced in during 2026.
--
-- WHY THIS MATTERS: date of birth drives the WMA age-grade standard, and the
-- site publishes age-grade percentages. The dates loaded by
-- import-runners-2026.sql were invented with no evidence at all, so those
-- percentages are currently fiction. The 2026 championship results carry age
-- categories, which bound a real birth-date window.
--
-- These are STILL NOT REAL DATES OF BIRTH. They are invented dates that fall
-- in the right band, so an age grade computed from one is close rather than
-- arbitrary. Replace them with the real dates as members supply them.
--
-- Each update is guarded: it only fires if the stored date is outside the
-- window the results imply, so re-running changes nothing, and a real date
-- someone has since entered is never overwritten by an invented one.
--
-- Usage:
--   psql "<connection string>" -v ON_ERROR_STOP=1 -f correct-dob-brackets-2026.sql
--
-- Editing a runner in /admin recalculates the seasons they appear in. Doing it
-- here in SQL does NOT, so run the time-trial recalculation afterwards, or open
-- and save one runner in /admin to trigger it.
-- ---------------------------------------------------------------------------

BEGIN;

WITH corrections (search_name, display_name, new_dob, window_from, window_to, evidence) AS (
  VALUES
    ('callum underwood', 'Callum Underwood', DATE '2001-04-01', DATE '2001-03-23', DATE '2005-01-01', '2026-01-01 Broadstone Quarter=21-24; 2026-02-01 Blackmore Vale Half=21-24; 2026-02-08 Portland Coastal Marathon=20-24; 2026-03-22 Bournemouth Half=21-24; 2026-05-10 Hardy''s Half=MU40; 2026-05-23 Egdon Easy 10k=m'),
    ('darren askew', 'Darren Askew', DATE '1966-06-01', DATE '1966-05-24', DATE '1976-05-23', '2026-05-23 Egdon Easy 10k=m50'),
    ('darren mills', 'Darren Mills', DATE '1966-06-01', DATE '1966-05-24', DATE '1976-05-23', '2026-05-23 Egdon Easy 10k=m50'),
    ('gary haylock', 'Gary Haylock', DATE '1966-06-01', DATE '1966-05-24', DATE '1976-05-23', '2026-05-23 Egdon Easy 10k=m50'),
    ('jack creighton', 'Jack Creighton', DATE '2005-03-01', DATE '2005-02-02', DATE '2008-02-01', '2026-02-01 Blackmore Vale Half=18-20'),
    ('jerry packer', 'Jerry Packer', DATE '1966-06-01', DATE '1966-05-04', DATE '1971-01-01', '2026-01-01 Broadstone Quarter=55-59; 2026-02-08 Portland Coastal Half Marathon=55-59; 2026-05-03 North Dorset Marathon=55-59'),
    ('laura last', 'Laura Last', DATE '1986-03-01', DATE '1986-02-09', DATE '1991-02-08', '2026-02-08 Portland Coastal Half Marathon=35-39'),
    ('laura pearson', 'Laura Pearson', DATE '1986-04-01', DATE '1986-03-23', DATE '1991-03-22', '2026-03-22 Bournemouth Half=35-39'),
    ('liz lewis', 'Liz Lewis', DATE '1971-03-01', DATE '1971-02-09', DATE '1976-01-01', '2026-01-01 Broadstone Quarter=50-54; 2026-02-08 Portland Coastal Half Marathon=50-54'),
    ('mark gray', 'Mark Gray', DATE '1986-06-01', DATE '1986-05-24', DATE '2011-05-23', '2026-05-23 Egdon Easy 10k=m'),
    ('pete wiles', 'Pete Wiles', DATE '1981-06-01', DATE '1981-05-18', DATE '1986-05-17', '2026-05-17 May-05=40-44; 2026-05-23 Egdon Easy 10k=m40'),
    ('steve white', 'Steve White', DATE '1966-03-01', DATE '1966-02-09', DATE '1971-01-01', '2026-01-01 Broadstone Quarter=55-59; 2026-02-08 Portland Coastal Half Marathon=55-59'),
    ('warren taylor', 'Warren Taylor', DATE '1961-03-01', DATE '1961-02-09', DATE '1966-01-01', '2026-01-01 Broadstone Quarter=60-64; 2026-02-08 Lytchett 10=60-64')

),
corrected AS (
  UPDATE runner r
  SET "dateOfBirth" = c.new_dob,
      "updatedAt"   = now()
  FROM corrections c
  WHERE r."searchName" = c.search_name
    AND r.status <> 'MERGED'
    -- Only when the stored date is outside the window the results imply. This
    -- is what stops a re-run touching anything, and what stops a real date
    -- someone has since entered being replaced by an invented one.
    AND (r."dateOfBirth" < c.window_from OR r."dateOfBirth" > c.window_to)
  RETURNING r.id
)
INSERT INTO audit_event (id, "actorId", action, "entityType", "entityId", summary)
SELECT gen_random_uuid(), NULL, 'runner.dob_bracket_corrected', 'Runner', NULL,
  jsonb_build_object(
    'source', '2026 club championship results age categories',
    'runnersCorrected', (SELECT count(*) FROM corrected),
    'note', 'Dates remain invented; they are now constrained to the observed age band.')
WHERE (SELECT count(*) FROM corrected) > 0;

COMMIT;

-- Check: every corrected runner should now sit inside their window.
WITH corrections (search_name, window_from, window_to) AS (
  VALUES
    ('callum underwood', DATE '2001-03-23', DATE '2005-01-01'),
    ('darren askew', DATE '1966-05-24', DATE '1976-05-23'),
    ('darren mills', DATE '1966-05-24', DATE '1976-05-23'),
    ('gary haylock', DATE '1966-05-24', DATE '1976-05-23'),
    ('jack creighton', DATE '2005-02-02', DATE '2008-02-01'),
    ('jerry packer', DATE '1966-05-04', DATE '1971-01-01'),
    ('laura last', DATE '1986-02-09', DATE '1991-02-08'),
    ('laura pearson', DATE '1986-03-23', DATE '1991-03-22'),
    ('liz lewis', DATE '1971-02-09', DATE '1976-01-01'),
    ('mark gray', DATE '1986-05-24', DATE '2011-05-23'),
    ('pete wiles', DATE '1981-05-18', DATE '1986-05-17'),
    ('steve white', DATE '1966-02-09', DATE '1971-01-01'),
    ('warren taylor', DATE '1961-02-09', DATE '1966-01-01')

)
SELECT r."givenName" || ' ' || r."familyName" AS runner,
       to_char(r."dateOfBirth",'YYYY-MM-DD') AS date_of_birth,
       to_char(c.window_from,'YYYY-MM-DD') || ' .. ' || to_char(c.window_to,'YYYY-MM-DD') AS window,
       CASE WHEN r."dateOfBirth" BETWEEN c.window_from AND c.window_to THEN 'ok' ELSE 'OUTSIDE' END AS status
FROM runner r JOIN corrections c ON c.search_name = r."searchName"
ORDER BY r."familyName";
