import { expect, test } from '@playwright/test';
import { e2eEnv, resetAndSeed } from './fixtures';

/**
 * The fixed donation action.
 *
 * Two acceptance criteria bear on this: it must be visible on every route
 * including administration, and it must never cover primary content or controls
 * at any supported viewport.
 */

test.beforeAll(() => resetAndSeed());

const JUSTGIVING_URL = e2eEnv().JUSTGIVING_URL as string;

test('appears on every public route and on sign-in', async ({ page }) => {
  for (const path of [
    '/',
    '/time-trial',
    '/club-championship',
    '/races',
    '/privacy',
    '/admin/sign-in',
  ]) {
    await page.goto(path);
    const donate = page.getByTestId('donate-action');
    await expect(donate, `missing on ${path}`).toBeVisible();
  }
});

test('links only to the configured JustGiving page, safely', async ({ page }) => {
  await page.goto('/');
  const donate = page.getByTestId('donate-action');

  await expect(donate).toHaveAttribute('href', JUSTGIVING_URL);
  await expect(donate).toHaveAttribute('target', '_blank');
  // noopener stops the opened page reaching back through window.opener.
  const rel = await donate.getAttribute('rel');
  expect(rel).toContain('noopener');
  expect(rel).toContain('noreferrer');

  // The app takes no payment and collects no donor data: there is no form.
  await expect(page.locator('form[action*="justgiving"]')).toHaveCount(0);
  await expect(page.locator('input[name*="amount" i]')).toHaveCount(0);
});

test('does not obscure page content at any supported width', async ({ page }) => {
  for (const size of [
    { width: 320, height: 640 },
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/time-trial/winter-2025-26');

    // Scroll to the bottom, where a fixed element is most likely to overlap
    // the last control on the page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    const donate = page.getByTestId('donate-action');
    await expect(donate).toBeVisible();

    const donateBox = await donate.boundingBox();
    expect(donateBox, `no bounding box at ${size.width}px`).not.toBeNull();

    // The scoring explainer is the last interactive control on the page.
    const explainer = page.getByText('How time-trial scoring works');
    await explainer.scrollIntoViewIfNeeded();
    const explainerBox = await explainer.boundingBox();
    expect(explainerBox).not.toBeNull();

    const overlaps =
      donateBox!.x < explainerBox!.x + explainerBox!.width &&
      donateBox!.x + donateBox!.width > explainerBox!.x &&
      donateBox!.y < explainerBox!.y + explainerBox!.height &&
      donateBox!.y + donateBox!.height > explainerBox!.y;
    expect(overlaps, `donate overlaps the explainer at ${size.width}px`).toBe(false);

    // And it stays a comfortable tap target.
    expect(donateBox!.height).toBeGreaterThanOrEqual(44);
  }
});

test('the page never scrolls horizontally at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/', '/time-trial/winter-2025-26', '/club-championship/2025', '/races']) {
    await page.goto(path);
    // Measure only once the page has settled: a mid-stream measurement made
    // this a flaky test rather than a clean pass or fail.
    await page.waitForLoadState('networkidle');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${path} scrolls horizontally at 320px`).toBe(false);
  }
});
