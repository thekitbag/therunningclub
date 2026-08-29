# Royal Manor of Portland Athletic Club

A public results and race-information PWA for RMPAC, plus a desktop-oriented
administration console for club volunteers.

Runners get time-trial standings, club championship tables and the race calendar
without signing in. Volunteers enter results through forms — no spreadsheets, no
developer, no shell.

Production: **https://rmpac.co.uk**

## What it does

| Section           | What it answers                                                          |
| ----------------- | ------------------------------------------------------------------------ |
| Home              | When is the next race? Who is leading? What was published most recently? |
| Time Trial        | Six-round season standings, per-round results, age-grade progression     |
| Club Championship | Best-six-lowest standings by calendar year, with eligibility progress    |
| Races             | Upcoming fixtures first, then past races                                 |
| `/admin`          | Runners, seasons, rounds, results, races, championships, administrators  |

A fixed **Donate to PSPA** action appears on every route. It is a plain outbound
link to JustGiving: the application processes no payments, stores no donor data,
and never reads a fundraising total.

## Scoring

The rules are the club's, not an approximation of them. They live as pure
functions in `src/domain/scoring` and are specified in
[`../therunningclub_project/specs/scoring-rules.md`](../therunningclub_project/specs/scoring-rules.md).

**Time trial** — two six-round seasons a year. Winter is October to March over
5 km and 7.5 km; summer is April to September over 6 km and 8 km.

- Finishing points rank each distance separately but across categories: 10 for
  the winner down to 1 for tenth, nothing below.
- Improvement points rank every positive age-grade improvement in one pool
  spanning both distances and both categories. With N improvers the largest gets
  N points, descending to 1.
- Round total is the two added. A season total is the best four round totals.
- Men's and women's tables are _views_ of the same calculated points, never a
  separate recalculation.

**Club championship** — low score wins. The first club finisher in a category
scores 1, the second 2. Six qualifying races make a runner eligible, and their
six lowest scores are summed. Ties stay tied; there is no tie-break in v1.

Age grading uses the WMA/USATF 2015 road standards, vendored and versioned —
see [`docs/age-grading.md`](docs/age-grading.md).

## Architecture

```
src/
├── domain/scoring/   Pure scoring functions. No database, no framework.
├── services/         Business rules, authorisation, transactions, recalculation
├── lib/              Config, auth, sessions, CSRF, audit, logging, DTOs
├── app/              Public and admin routes (Next.js App Router)
└── components/       Shared UI
```

Three decisions worth knowing about:

**Derived scores are never patched in place.** Any change to a season's inputs —
a time, a birth date, a category, a round date — replays the whole season
through the pure domain inside one transaction. Recalculating everything is
cheap at club scale and removes the entire class of bug where an edit updates
one row and leaves a dependent row stale.

**Public responses are assembled by hand.** `src/services/public-queries.ts`
names every field that is allowed out. Adding a private column to the schema
later cannot leak it, because nothing in that file will mention it. Dates of
birth are used only to derive age-grade percentages and never reach a page,
cache or log.

**Publication is atomic and previewed.** Publishing a round shows what it will
change — which later rounds, whose season totals — before it is confirmed, and
refuses outright if any result cannot be scored.

## Getting started

Requires Node 22+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL
createdb rmpac_dev
npm run migrate:dev

# Optional: a fully populated club to click through. Every record is
# labelled "(SAMPLE)" and seeding is refused in production.
ALLOW_SAMPLE_SEED=true npm run seed:sample

npm run dev
```

Create your first administrator:

```bash
BOOTSTRAP_ADMIN_EMAIL=you@example.org \
BOOTSTRAP_ADMIN_PASSWORD='a long passphrase' \
BOOTSTRAP_ADMIN_NAME='Your Name' \
npm run bootstrap:admin
```

## Testing

```bash
npm test                  # 125 unit tests: scoring, age grading, config, security
npm run test:integration  # 100 integration tests against a real database
npm run test:e2e          #  88 browser tests on desktop and phone viewports
npm run verify            # everything except the browser suite
```

Integration and browser tests need a database whose name contains `test`; both
suites refuse to run against anything else, because they truncate between tests.

```bash
createdb rmpac_test
cp .env.test.example .env.test
cp .env.e2e.example .env.e2e   # then set DATABASE_URL in both
```

The unit suite covers every invariant in the scoring specification, including a
golden fixture that reproduces the published round of 24 March 2026 exactly —
its finishing points, all ten improvements, and the best-four season totals.

## Security and privacy

- Individual administrator accounts. No shared password, no public sign-up.
- Passwords hashed with scrypt (N=65536, r=8, ~64 MiB per hash).
- Sessions are opaque random tokens; only their SHA-256 is stored.
- Disabling an administrator revokes every session they hold immediately.
- CSRF protection uses OWASP's HMAC token pattern, bound to the session, with an
  explicit same-origin check on every mutation.
- Sign-in is rate limited and gives an identical message for a wrong password,
  an unknown address and a disabled account, so it cannot enumerate accounts.
- Admin responses are `private, no-store` and are excluded from the service
  worker cache in both directions.
- Logs and audit records pass through mandatory redaction of passwords, tokens,
  secrets and dates of birth.

## Deployment

See [`docs/deployment.md`](docs/deployment.md) and
[`docs/release-checklist.md`](docs/release-checklist.md). The blueprint in
[`render.yaml`](render.yaml) declares one Node web service and one managed
PostgreSQL database.

Production fails fast on startup if a security-critical value is missing or is
still a development placeholder, so a misconfigured deploy fails its health
check rather than serving in an unsafe state.

## Decisions and assumptions

Recorded here because they were choices, not requirements:

- **scrypt rather than Argon2id.** Both are permitted by the specification.
  scrypt is built into Node, so the Render build has no native compilation step
  and one deployment failure mode disappears. Parameters are stored per record,
  so the cost can be raised later without invalidating existing passwords.
- **Stateless CSRF tokens, no CSRF cookie.** A double-submit cookie has to be
  written while a page renders, which Next.js forbids outside actions and route
  handlers. The HMAC binding to the session gives the same guarantee without it.
- **Rate limiting is in-process.** Accurate for the single-instance deployment
  described in `render.yaml`; it must move to a shared store before the service
  is scaled horizontally.
- **Calendar dates are stored as dates, not instants.** A round stored as an
  instant would drift across a day boundary under British Summer Time and
  silently change an age-grade calculation.
- **Whole-round saves.** Results are entered for a whole round at once because
  finishing points depend on the entire field; a row-at-a-time save would leave
  every other runner's position wrong until the last row arrived.
- **No `scroll-behavior: smooth`.** It delayed the skip link by hundreds of
  milliseconds, which is the wrong trade for the people who rely on it.
- **`deepmerge-ts` is pinned forward with an npm override.** Prisma's CLI still
  depends on a 7.x release carrying advisory GHSA-ggr8-5vv4-36mx, and no Prisma
  7 release has picked up the fix. The override forces 8.x; Prisma's schema
  validation, migrations, client generation and the full test suite all pass
  with it. Remove the override once Prisma updates.

### Known limits

- The published time-trial PDF is image-derived and its top row shows an
  improvement of 9 against a round total of 20. The ten positive improvements
  make the intended value 10. The deterministic rule is implemented and the
  discrepancy is recorded in `golden-round.test.ts`, per the reference
  precedence rule.
- The privacy notice wording and its stated lawful basis need the club owner's
  approval before launch.
- v1 has no tie-break: equal totals stay equal, by design.

## Specification

This repository implements the specification in the sibling planning repository,
`../therunningclub_project`. See [`AGENTS.md`](AGENTS.md) for how to work in
this codebase.
