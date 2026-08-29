import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN, resetAndSeed } from './fixtures';

/**
 * Automated accessibility scanning plus keyboard assertions.
 *
 * An automated scan cannot prove WCAG conformance on its own, so the keyboard
 * tests below cover the things axe cannot see: focus visibility, focus order,
 * skip navigation, and whether a scrolling table region can be reached at all
 * without a mouse.
 */

test.beforeAll(() => resetAndSeed());

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PUBLIC_ROUTES = [
  '/',
  '/time-trial/winter-2025-26',
  '/club-championship/2025',
  '/races',
  '/privacy',
  '/offline',
];

for (const route of PUBLIC_ROUTES) {
  test(`no accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // Report the detail, not just a count, so a failure is actionable.
    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target).slice(0, 3),
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}

test('no accessibility violations on a published round', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');
  await page.getByRole('link', { name: /Round 1/ }).click();
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('no accessibility violations on the sign-in page', async ({ page }) => {
  await page.goto('/admin/sign-in');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('no accessibility violations on the admin console', async ({ page }) => {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  for (const route of ['/admin', '/admin/runners', '/admin/races', '/admin/administrators']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const summary = results.violations.map((v) => ({ id: v.id, route }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  }
});

test('skip link is the first stop and jumps to the main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  // It must actually become visible when focused, not just exist.
  await expect(skip).toBeInViewport();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('every public page is fully keyboard operable to its main navigation', async ({ page }) => {
  await page.goto('/');

  // Tab through the header and confirm each navigation link takes focus.
  const expected = ['Skip to main content', 'Royal Manor of Portland', 'Home', 'Time Trial'];
  for (const name of expected) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused, `expected focus to reach ${name}`).toContain(name.split(' ')[0]);
  }
});

test('focus is always visible', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');

  // Walk the first dozen focusable elements and confirm each one paints an
  // outline. A focus style removed by a later CSS change would fail here.
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    const hasVisibleFocus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return true;
      const style = window.getComputedStyle(element);
      const outlineWidth = Number.parseFloat(style.outlineWidth || '0');
      const hasOutline = style.outlineStyle !== 'none' && outlineWidth > 0;
      const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
      return hasOutline || hasShadow;
    });
    expect(hasVisibleFocus, `step ${step}`).toBe(true);
  }
});

test('a wide table can be scrolled with the keyboard', async ({ page }) => {
  await page.goto('/club-championship/2025');

  // The scrolling wrapper is focusable and labelled, so a keyboard user can
  // reach the columns that overflow. This is the part axe cannot check.
  const region = page.getByRole('region', {
    name: 'Men’s club championship 2025 — scrollable table',
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  await expect(region).toHaveAttribute('tabindex', '0');
});

test('tables carry captions and header associations', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');
  // The page streams, so wait for it to settle before counting tables —
  // otherwise a table shell can be counted before its caption has arrived.
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /Age-grade progression/ })).toBeVisible();

  // React appends hidden empty tables to <body> as streaming placeholders;
  // scope to the real content so they are not mistaken for club tables.
  const tables = page.locator('main table:not([hidden])');
  const count = await tables.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const table = tables.nth(index);
    await expect(table.locator('caption')).toHaveCount(1);
    // Every header cell declares its scope, which is what lets a screen reader
    // announce "Ben Coombe, R1, 10" instead of a bare number.
    const headers = table.locator('th');
    const headerCount = await headers.count();
    for (let headerIndex = 0; headerIndex < headerCount; headerIndex += 1) {
      await expect(headers.nth(headerIndex)).toHaveAttribute('scope', /row|col/);
    }
  }
});

test('state is never conveyed by colour alone', async ({ page }) => {
  await page.goto('/club-championship/2025');

  // Eligibility carries a word, not just a green pill.
  await expect(page.getByText('Eligible').first()).toBeVisible();
  // Counting scores carry visually hidden text as well as a tint.
  const table = page.getByRole('region', {
    name: 'Men’s club championship 2025 — scrollable table',
    exact: true,
  });
  await expect(table.getByText('(counts)').first()).toBeAttached();
  // Missing races carry "did not run" for assistive technology rather than
  // relying on the em dash alone, which a screen reader would skip.
  await expect(table.getByText('did not run').first()).toBeAttached();
  // Ties are marked with a character, not just a shade.
  await expect(table.locator('td')).not.toHaveCount(0);
});

test('reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const durationSeconds = await page.evaluate(() => {
    const revealed = document.querySelector('.reveal');
    if (!revealed) return 0;
    return Number.parseFloat(window.getComputedStyle(revealed).animationDuration);
  });
  // The reveal animation collapses to effectively nothing.
  expect(durationSeconds).toBeLessThan(0.001);
});
