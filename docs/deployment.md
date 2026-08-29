# Deploying RMPAC on Render

The application is one Node web service plus one managed PostgreSQL database.
[`render.yaml`](../render.yaml) declares both.

## 1. Create the services

From the Render dashboard, choose **New → Blueprint** and point it at this
repository. Render reads `render.yaml` and creates:

- `rmpac` — the Node web service
- `rmpac-db` — the managed PostgreSQL database

`DATABASE_URL` is wired automatically from the database to the service, and
`SESSION_SECRET` is generated on first deploy. Nothing secret is committed.

## 2. Set the remaining configuration

| Variable            | Value                                            | Notes                                                                                                 |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`        | `https://rmpac.co.uk`                            | Already in the blueprint. Must match the custom domain exactly, with no trailing slash.               |
| `JUSTGIVING_URL`    | `https://www.justgiving.com/page/mark-mike-pspa` | Already in the blueprint. Production refuses to start unless this is a real `justgiving.com` address. |
| `CLUB_WELCOME_COPY` | optional                                         | Plain text for the home page. Falls back to a built-in default.                                       |
| `FUNDRAISING_COPY`  | optional                                         | Plain text for the fundraising card.                                                                  |

The application **fails fast on startup** if a security-critical value is
missing, still set to a development placeholder, or if `APP_ORIGIN` is not
HTTPS. A misconfigured deploy therefore fails its health check rather than
serving in an unsafe state — check the service logs for a message naming the
offending variables.

## 3. Attach the custom domain

1. In the service, open **Settings → Custom Domains** and add `rmpac.co.uk`
   (and `www.rmpac.co.uk` if you want it to redirect).
2. Add the DNS records Render shows you at your registrar.
3. Wait for Render to issue the TLS certificate.
4. Confirm `APP_ORIGIN` is `https://rmpac.co.uk`.

Changing the domain later means updating `APP_ORIGIN` and the Render domain
settings. No code change and no rebuild of application logic is required.

## 4. Create the first administrator

There is no public sign-up, and no "create the first admin" web page — that
would be a way to lose the site to whoever found it first. Instead:

1. In the Render dashboard set, as one-time values:
   - `BOOTSTRAP_ADMIN_EMAIL`
   - `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters)
   - `BOOTSTRAP_ADMIN_NAME`
2. Open the service **Shell** and run:
   ```bash
   npm run bootstrap:admin
   ```
3. **Remove the three variables** from the environment.
4. Sign in at `https://rmpac.co.uk/admin/sign-in` and change the password.

The command is idempotent: run again and it reports that the account already
exists without touching it.

## 5. Verify

```bash
curl -s https://rmpac.co.uk/api/health
# {"status":"ok","configured":true,"database":"ok","durationMs":12}
```

Then walk the smoke test in [`release-checklist.md`](release-checklist.md).

## Recovering from a total lockout

If every administrator account is disabled or the passwords are lost, the
bootstrap command is also the recovery path:

```bash
BOOTSTRAP_ADMIN_EMAIL=someone@example.org \
BOOTSTRAP_ADMIN_PASSWORD='a new long passphrase' \
BOOTSTRAP_ADMIN_RESET=true \
npm run bootstrap:admin
```

With `BOOTSTRAP_ADMIN_RESET=true` this resets that account's password, marks it
active, and revokes every session it holds. Remove the variables afterwards.

## Backups

**Whether backups exist depends on the database plan you choose, and this
document does not assume they do.**

- Render's paid PostgreSQL plans include automatic daily backups with
  point-in-time recovery. The free plan does not.
- Check **Database → Backups** in the dashboard and confirm what you actually
  have before relying on it.

Take a manual backup before any migration:

```bash
# From the Render shell, or locally against the external connection string.
pg_dump "$DATABASE_URL" --format=custom --file=rmpac-$(date +%Y%m%d).dump
```

Restore:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" rmpac-YYYYMMDD.dump
```

A backup you have never restored is a hypothesis, not a backup. Restore one into
a scratch database at least once so the procedure is known to work.

## Scaling note

Sign-in rate limiting is held in the web service's own memory. That is accurate
for a single instance, which is what this blueprint describes. If the service is
ever scaled to more than one instance, the limiter must move to the database or
a shared store — see `src/lib/rate-limit.ts`.
