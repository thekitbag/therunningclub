# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

---

# RMPAC application

Royal Manor of Portland Athletic Club: a public results and race-information
PWA, plus a desktop-oriented administration console for club volunteers.

## Specification

This repository implements a specification that lives in the sibling planning
repository, `../therunningclub_project`. **That specification is the contract.**
Read it before changing anything that touches scoring, privacy or publication:

- [`../therunningclub_project/specs/product-spec.md`](../therunningclub_project/specs/product-spec.md) — users, experience, scope, acceptance criteria
- [`../therunningclub_project/specs/scoring-rules.md`](../therunningclub_project/specs/scoring-rules.md) — authoritative scoring calculations
- [`../therunningclub_project/specs/technical-spec.md`](../therunningclub_project/specs/technical-spec.md) — architecture, security, deployment, quality
- [`../therunningclub_project/references/README.md`](../therunningclub_project/references/README.md) — source material and precedence

Do not reinterpret a scoring rule from memory. If a change appears to require
one, raise the conflict rather than silently altering behaviour.

## Architecture

Five layers, deliberately kept separate:

| Layer                | Location                    | Rule                                                                               |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Presentation         | `src/app`, `src/components` | Server components by default; client components only where interaction requires it |
| Application services | `src/services`              | All business rules and authorisation live here                                     |
| Scoring domain       | `src/domain/scoring`        | Pure functions. No Prisma, no React, no `process.env`                              |
| Persistence          | `prisma/`, `src/lib/db.ts`  | Prisma with the pg driver adapter                                                  |
| Infrastructure       | `src/lib`                   | Config, auth, sessions, CSRF, audit, logging, DTOs                                 |

### Rules that are easy to break

1. **The scoring domain stays pure.** It must be testable without a database or
   a server. Every rule in `scoring-rules.md` has a test in
   `src/domain/scoring/__tests__`.
2. **Derived scores are never patched in place.** Any change to a season's
   inputs replays the whole season through the domain inside one transaction —
   see `recalculateSeason` in `src/services/time-trials.ts`.
3. **Public responses are built by hand in `src/services/public-queries.ts`.**
   Never serialise a Prisma entity to a client. Dates of birth, drafts,
   publication metadata and administrator identities must not reach a public
   page, cache or log.
4. **Client components must not import server modules.** Anything reaching
   `node:crypto` or Prisma breaks the browser bundle at runtime. Form state
   lives in `src/lib/action-state.ts`; the password policy lives in
   `src/lib/password-policy.ts`. Both exist for exactly this reason.
5. **Authorisation is checked inside every service command**, not only in a
   page or layout. A server action can be invoked by identifier without any
   page rendering.
6. **Never signal state with colour alone.** Counting scores, eligibility,
   publication state and race status each carry a mark or a label as well.

## Commands

```bash
npm run dev              # development server
npm run verify           # format, lint, types, unit, integration, build
npm test                 # unit tests (scoring domain, config, security)
npm run test:integration # integration tests against an isolated database
npm run test:e2e         # Playwright journeys and accessibility scans
npm run migrate:dev      # create and apply a migration
npm run bootstrap:admin  # create or recover the first administrator
```

Integration and browser tests need a PostgreSQL database whose name contains
`test`; both suites refuse to run against anything else, because they truncate.

## Before you finish

Run `npm run verify` and `npm run test:e2e`. Fix failures rather than weakening
a check. See [`docs/release-checklist.md`](docs/release-checklist.md) for what a
deploy requires.
