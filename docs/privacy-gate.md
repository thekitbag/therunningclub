# The club passcode

The whole public site sits behind a single shared passcode. This explains what
that protects, what it does not, and how to run it.

## What the club asked for

Members' names and running times should not be findable by strangers on the open
internet — not by a search engine, not by someone typing a member's name into
Google, not by a passing employer.

That is a specific and modest goal, and the design follows from it.

## Why a shared passcode rather than individual accounts

Individual accounts would mean collecting and storing an email address for every
member. That is **more** personal data to protect, in service of a privacy
requirement — the wrong direction. It would also need an email-sending service
for password resets, and someone to administer 40-plus accounts.

A single shared passcode meets the actual goal, collects nothing from runners at
all, and needs no administration beyond occasionally changing it.

## What it does and does not do

**It does:**

- keep the site out of search engines, via `robots.txt` and an
  `X-Robots-Tag: noindex` header on every response;
- stop anyone without the passcode reading names, times or standings;
- lock every device out when the passcode is rotated.

**It does not:**

- stop a member sharing the passcode with someone else;
- record who looked at what;
- control which members can see which results.

That is by design. It is a curtain, not a vault. Administrator access — which
can _change_ published results — uses individual accounts with real passwords,
session revocation and an audit trail, and is a much stronger mechanism.

## How it works

A member enters the passcode once on a device. The server checks it in constant
time, then sets an `HttpOnly` cookie containing an issue timestamp and an HMAC
over it, keyed on the session secret **and the passcode itself**.

Keying on the passcode is what makes rotation work: change the passcode and
every previously issued cookie stops verifying, so everybody is asked for the
new one.

The cookie lasts 180 days. That is deliberately long — a member should enter the
passcode about once a season. A short expiry would push people to write it down
somewhere less safe than their own browser.

Enforcement is in `src/middleware.ts`, which runs before every request. It is
there rather than in individual pages because middleware gates a route added
later **by default**, whereas a per-page check is one you can forget to add.

### What stays reachable while locked

Kept deliberately short, each with a reason:

| Path                                                      | Why                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `/unlock`                                                 | Otherwise nobody could ever get in                                    |
| `/api/health`                                             | Render's health check is unauthenticated, and it returns no club data |
| `/api/ping`                                               | The reachability probe behind the offline banner                      |
| `/_next/…`, `/icons/…`, `/manifest.webmanifest`, `/sw.js` | Without these the unlock page cannot render                           |
| `/robots.txt`                                             | Crawlers must be able to read the instruction to go away              |
| `/admin/…`                                                | Has its own, stronger authentication                                  |

The list lives in one place, `isAlwaysAllowed` in `src/lib/site-access.ts`.

## Running it

### Setting or rotating the passcode

Set `SITE_PASSCODE` in the Render dashboard and redeploy. Rotating it signs
every device out, so tell members before you do it.

Choose something a member can repeat over the phone. Length matters more than
symbols; a couple of words and a number is fine.

**Production will not start without it.** That is intentional — a deployment
that booted without a passcode would publish exactly the data the passcode
exists to protect.

### Locally

`SITE_PASSCODE` is empty in `.env`, so development is not gated. Set a value to
exercise the gate.

The browser suite **does** run gated, because production is — see
`tests/e2e/global-setup.ts`, which unlocks once and saves the cookie, and
`tests/e2e/gate.spec.ts`, which discards it to test the locked view.

## If the site was public before the gate went up

Search engines may already hold pages. `robots.txt` and `noindex` stop _future_
indexing but will not remove what is already there.

1. In [Google Search Console](https://search.google.com/search-console), verify
   ownership of `rmpac.co.uk`.
2. Use **Removals → New request** to temporarily hide the URLs.
3. The `noindex` header makes the removal permanent once Google recrawls.

Repeat for Bing Webmaster Tools if you want to be thorough.

## Offline caching

The installed app caches pages it has shown, so a member can read the last
standings offline. That cache lives on their own device and only holds pages
they were authorised to see.

When a device is locked, or the passcode is rotated, the unlock page tells the
service worker to delete its cached pages — so a locked-out device cannot read
old results by going offline.

## If the club later wants per-member accounts

Nothing here blocks that. The gate is a middleware check against a signed
cookie; swapping the source of that cookie from "knows the shared passcode" to
"signed in as a member" is a contained change. The administrator account system
already provides a working model for hashing, sessions and revocation.
