# Release checklist

## Before deploying

- [ ] `npm run verify` passes from a clean checkout (`npm ci`).
- [ ] `npx playwright test` passes.
- [ ] `npm run audit:prod` reports no high or critical production advisories.
- [ ] `npx prisma migrate status` reports no drift.
- [ ] Take a manual database backup (see [`deployment.md`](deployment.md)).

## Deploying

1. Merge to `main`. Render deploys automatically on commit.
2. The pre-deploy command runs `prisma migrate deploy` before the new instance
   takes traffic, so a failed migration fails the deploy rather than serving a
   half-migrated schema.
3. Render waits for `/api/health` to return `200` before routing to the new
   instance.

## After deploying

- [ ] `curl -s https://rmpac.co.uk/api/health` returns `"status":"ok"`.
- [ ] Home page loads and shows the current standings.
- [ ] Time trial and club championship pages open the current season and year.
- [ ] The donate button opens the correct JustGiving page in a new tab.
- [ ] Sign in at `/admin/sign-in`, then sign out.
- [ ] Check the page source of a public page for a date of birth — there must
      not be one.

## Rolling back

Render keeps previous deploys. **Roll back the service from the dashboard
(Deploys → Rollback).**

Migrations do not roll back automatically. This matters:

- A migration that only _adds_ tables or nullable columns is safe to leave in
  place while the service rolls back to the previous image.
- A migration that _drops or renames_ something is not. Restore the backup taken
  before the deploy.

Because of that asymmetry, prefer additive migrations, and deploy a destructive
change separately from the code that depends on it.

## Monthly

- [ ] Confirm backups are actually being taken and can be restored.
- [ ] Review `npm audit` and update dependencies.
- [ ] Review the administrator list at `/admin/administrators` and disable any
      account that is no longer needed.
