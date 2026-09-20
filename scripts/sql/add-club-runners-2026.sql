-- ---------------------------------------------------------------------------
-- RMPAC members who race but are not in the Summer 2026 time trial.
--
-- Found by reading the 2026 club-championship results, club-affiliation only:
-- the DRRL league database, the Portland Coastal PDFs, the Egdon Easy 10k
-- results and the Hardy's Half PDF. Every one is recorded under a Royal Manor
-- of Portland club entry. See data/championship-2026-club-results.csv.
--
-- Run this BEFORE importing results: a championship result cannot be attached
-- to a runner who does not exist.
--
-- Safe to run more than once. Guarded by NOT EXISTS on `searchName`, matching
-- normaliseSearchName() in src/services/runners.ts.
--
-- Usage:
--   psql "<connection string>" -v ON_ERROR_STOP=1 -f add-club-runners-2026.sql
--
-- ---------------------------------------------------------------------------
-- DATES OF BIRTH ARE STILL INVENTED, BUT NO LONGER ARBITRARY
-- ---------------------------------------------------------------------------
--
-- The results carry age categories. Each one says "this runner was aged A to B
-- on this date", which bounds a birth-date window; several races bound it from
-- both sides. The date below is the first of a month inside that window, so it
-- lands in the RIGHT AGE CATEGORY even though it is not the real date. The
-- window and the evidence behind it are quoted per runner.
--
-- No runner's observations contradicted each other across the five sources,
-- which is also what makes the identity matching credible.
--
-- Every invented date is the 1st of a month, so this finds what is still to be
-- confirmed:
--   SELECT "givenName","familyName","dateOfBirth" FROM runner
--   WHERE EXTRACT(DAY FROM "dateOfBirth") = 1 ORDER BY "familyName";
-- ---------------------------------------------------------------------------

BEGIN;

WITH incoming (given_name, family_name, date_of_birth, category) AS (
  VALUES
    -- Alison Sperring: window 1966-06-13..1971-06-12 (1825d)
    --   evidence: 2026-05-23 Egdon Easy 10k=f50; 2026-06-12 Purbeck 10k=55-59
    ('Alison', 'Sperring', DATE '1966-07-01', 'FEMALE'),
    -- Amanda Underwood: window 1966-05-24..1971-01-01 (1683d)
    --   evidence: 2026-01-01 Broadstone Quarter=55-59; 2026-02-01 Blackmore Vale Half=55-59; 2026-02-08 Portland Coastal Half Marathon=55-59; ...
    ('Amanda', 'Underwood', DATE '1966-06-01', 'FEMALE'),
    -- David Whitlow: window 1956-05-24..1961-01-01 (1683d)
    --   evidence: 2026-01-01 Broadstone Quarter=65-69; 2026-02-08 Lytchett 10=65-69; 2026-05-23 Egdon Easy 10k=m60
    ('David', 'Whitlow', DATE '1956-06-01', 'MALE'),
    -- Marian Arnott-Weeks: window 1946-08-03..1951-01-01 (1612d)
    --   evidence: 2026-01-01 Broadstone Quarter=75-79; 2026-02-01 Blackmore Vale Half=75-79; 2026-02-08 Lytchett 10=75-79; ...
    ('Marian', 'Arnott-Weeks', DATE '1946-09-01', 'FEMALE'),
    -- Mark Webb: window 1986-05-11..2011-05-10 (9130d)
    --   evidence: 2026-05-10 Hardy's Half=MU40
    ('Mark', 'Webb', DATE '1986-06-01', 'MALE'),
    -- Matthew Bacon: window 1976-05-24..1981-03-22 (1763d)
    --   evidence: 2026-03-22 Bournemouth Half=45-49; 2026-05-23 Egdon Easy 10k=m40
    ('Matthew', 'Bacon', DATE '1976-06-01', 'MALE'),
    -- Michael Tizard: window 1961-02-09..1966-02-08 (1825d)
    --   evidence: 2026-02-08 Portland Coastal 10km=60-64
    ('Michael', 'Tizard', DATE '1961-03-01', 'MALE'),
    -- Mike Crocker: window 1986-05-24..1986-06-12 (19d)
    --   evidence: 2026-02-08 Portland Coastal 10km=35-39; 2026-05-23 Egdon Easy 10k=m; 2026-06-12 Purbeck 10k=40-44
    ('Mike', 'Crocker', DATE '1986-06-01', 'MALE'),
    -- Sunny Stanley: window 1971-02-09..1976-02-08 (1825d)
    --   evidence: 2026-02-08 Portland Coastal Half Marathon=50-54
    ('Sunny', 'Stanley', DATE '1971-03-01', 'MALE'),
    -- Suzie Ward: window 1971-02-09..1976-01-01 (1787d)
    --   evidence: 2026-01-01 Broadstone Quarter=50-54; 2026-02-08 Lytchett 10=50-54
    ('Suzie', 'Ward', DATE '1971-03-01', 'FEMALE')
),
prepared AS (
  SELECT i.*, regexp_replace(
           regexp_replace(lower(i.given_name || ' ' || i.family_name), '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g') AS search_name
  FROM incoming i
),
inserted AS (
  INSERT INTO runner (id, "givenName", "familyName", "searchName",
                      "dateOfBirth", category, status, "createdAt", "updatedAt")
  SELECT gen_random_uuid(), p.given_name, p.family_name, p.search_name,
         p.date_of_birth, p.category::"ScoringCategory", 'ACTIVE'::"RunnerStatus", now(), now()
  FROM prepared p
  WHERE NOT EXISTS (
    SELECT 1 FROM runner r WHERE r."searchName" = p.search_name AND r.status <> 'MERGED')
  RETURNING id
)
INSERT INTO audit_event (id, "actorId", action, "entityType", "entityId", summary)
SELECT gen_random_uuid(), NULL, 'runner.imported', 'Runner', NULL,
  jsonb_build_object(
    'source', '2026 club championship race results (club-affiliated entries only)',
    'runnersInserted', (SELECT count(*) FROM inserted),
    'datesOfBirth', 'INVENTED but constrained to the age category observed in results')
WHERE (SELECT count(*) FROM inserted) > 0;

COMMIT;

SELECT r."givenName" || ' ' || r."familyName" AS runner, r.category,
       to_char(r."dateOfBirth",'YYYY-MM-DD') AS date_of_birth,
       EXTRACT(YEAR FROM age(DATE '2026-09-01', r."dateOfBirth"))::int AS age_today
FROM runner r ORDER BY r."familyName", r."givenName";
