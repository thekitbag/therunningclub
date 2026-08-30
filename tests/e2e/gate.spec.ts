import { expect, test } from '@playwright/test';
import { e2eEnv, resetAndSeed } from './fixtures';

/**
 * The club passcode gate, seen from a device that has not been unlocked.
 *
 * Every other spec runs from the saved member state, so this one deliberately
 * discards it — otherwise it would be testing the unlocked site and quietly
 * proving nothing.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(() => resetAndSeed());

const PASSCODE = e2eEnv().SITE_PASSCODE as string;

const GATED = [
  '/',
  '/time-trial',
  '/time-trial/winter-2025-26',
  '/club-championship',
  '/club-championship/2025',
  '/races',
  '/privacy',
];

test('every page showing club results is behind the passcode', async ({ page }) => {
  for (const path of GATED) {
    await page.goto(path);
    await expect(page, `${path} was reachable while locked`).toHaveURL(/\/unlock/);
    // And nothing from the club is on the page that replaced it.
    await expect(page.getByRole('heading', { name: /Royal Manor of Portland/i })).toBeVisible();
    await expect(page.getByLabel('Club passcode')).toBeVisible();
  }
});

test('the locked page leaks no runner name or result', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');
  const html = await page.content();

  // Names seeded into the fixture, and the shapes results take.
  for (const needle of ['Jim Young', 'Liz Lewis', 'Debbie Cain', 'Winter 2025/26']) {
    expect(html, `"${needle}" appeared on the locked page`).not.toContain(needle);
  }
});

test('search engines are told to stay away', async ({ page, request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow:\s*\//);

  const response = await page.goto('/unlock');
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
});

test('the health check stays open, because Render needs it', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('administration is reachable, behind its own stronger sign-in', async ({ page }) => {
  // The passcode must not stand between an administrator and the sign-in form,
  // and it must not be an alternative to signing in either.
  await page.goto('/admin/runners');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong passcode is refused and reveals nothing', async ({ page }) => {
  await page.goto('/races');
  await page.getByLabel('Club passcode').fill('not-the-passcode');
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page.getByTestId('form-feedback')).toContainText('not recognised');
  await expect(page).toHaveURL(/\/unlock/);
});

test('the right passcode unlocks and returns you to the page you asked for', async ({
  page,
  context,
}) => {
  await page.goto('/club-championship/2025');
  await expect(page).toHaveURL(/\/unlock\?next=/);

  await page.getByLabel('Club passcode').fill(PASSCODE);
  await page.getByRole('button', { name: 'Enter' }).click();

  // Back to the page originally requested, not the home page.
  await expect(page).toHaveURL(/\/club-championship\/2025$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Club Championship 2025');

  // The device stays unlocked for subsequent navigation.
  await page.goto('/time-trial/winter-2025-26');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Winter 2025/26');

  // The cookie proving it cannot be read by page script.
  const cookie = (await context.cookies()).find((c) => c.name === 'rmpac_access');
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('rmpac_access'))).toBe(false);
});

test('unlocking one device does not unlock another', async ({ browser }) => {
  const first = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const firstPage = await first.newPage();
  await firstPage.goto('/unlock');
  await firstPage.getByLabel('Club passcode').fill(PASSCODE);
  await firstPage.getByRole('button', { name: 'Enter' }).click();
  await expect(firstPage).not.toHaveURL(/\/unlock/);

  const second = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const secondPage = await second.newPage();
  await secondPage.goto('/races');
  await expect(secondPage).toHaveURL(/\/unlock/);

  await first.close();
  await second.close();
});
