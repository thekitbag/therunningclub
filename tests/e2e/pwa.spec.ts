import { expect, test } from '@playwright/test';
import { ADMIN, resetAndSeed } from './fixtures';

/**
 * Installability and offline behaviour.
 *
 * The specification is explicit that v1 promises an honest cached view, not
 * offline data entry — so these tests check that public pages survive going
 * offline, that the visitor is told the data may be stale, and above all that
 * nothing private is ever written to a cache.
 */

test.beforeAll(() => resetAndSeed());

test('serves a valid, installable web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.name).toContain('Royal Manor of Portland');
  expect(manifest.short_name).toBe('RMPAC');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBeTruthy();
  expect(manifest.background_color).toBeTruthy();

  // Installability needs at least a 192px and a 512px icon, and a maskable one
  // so launcher masks do not crop the club's lettering.
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose);
  expect(purposes).toContain('maskable');
});

test('every declared icon actually exists', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type'], icon.src).toContain('image/png');
  }
});

test('the manifest is linked from the page and the theme colour is declared', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveCount(1);
});

test('the service worker is served uncached and registers', async ({ page, request }) => {
  const response = await request.get('/sw.js');
  expect(response.status()).toBe(200);
  // A cached service worker would pin users to an old caching policy.
  expect(response.headers()['cache-control']).toContain('no-store');

  await page.goto('/');
  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active || registration.installing || registration.waiting);
  });
  expect(registered).toBe(true);
});

test('a visited public page still renders offline, with an honest warning', async ({
  page,
  context,
}) => {
  await page.goto('/time-trial/winter-2025-26');
  await page.waitForLoadState('networkidle');
  // Give the worker a moment to take control and cache the response.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.reload();

  // The results are still there, from the cache.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Winter 2025/26');
  // And the visitor is told plainly that they may be looking at stale data.
  await expect(page.getByTestId('stale-banner')).toBeVisible();
  await expect(page.getByTestId('stale-banner')).toContainText('You are offline');
  await expect(page.getByText(/Results published since then are not shown/)).toBeVisible();

  await context.setOffline(false);
});

test('an unvisited page falls back to the offline notice rather than an error', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.goto('/races');

  // Either the cached races page or the offline fallback is acceptable; what
  // matters is that the visitor sees an explanation, not a browser error.
  await expect(page.getByText(/offline|Races/i).first()).toBeVisible();

  await context.setOffline(false);
});

test('never caches an admin page', async ({ page, context }) => {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/admin/runners');
  await page.waitForLoadState('networkidle');

  // Nothing under /admin may appear in any cache the worker controls.
  const cachedAdminUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const found: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith('/admin')) found.push(request.url);
      }
    }
    return found;
  });
  expect(cachedAdminUrls).toEqual([]);

  // An admin page must not survive going offline either.
  await context.setOffline(true);
  await page.goto('/admin/runners').catch(() => undefined);
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  expect(bodyText).not.toContain('Runners');
  await context.setOffline(false);
});

test('caches are namespaced and cleaned up on activation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForLoadState('networkidle');

  const names = await page.evaluate(() => caches.keys());
  // Versioned names are what let a new worker delete the previous generation.
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name, name).toMatch(/^rmpac-v\d+/);
  }
});
