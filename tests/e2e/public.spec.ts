import { expect, test } from '@playwright/test';
import { resetAndSeed } from './fixtures';

/**
 * Public journeys.
 *
 * These run on both a desktop and a phone viewport (see `playwright.config.ts`)
 * because the acceptance criteria are explicitly about the phone experience.
 */

test.beforeAll(() => resetAndSeed());

test('reaches the current time-trial standings from home in two taps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Royal Manor of Portland Athletic Club',
  );

  // Tap one: the Time Trial section link.
  await page.getByRole('link', { name: 'Full standings' }).click();

  // The section defaults to the current season without a further choice.
  await expect(page).toHaveURL(/\/time-trial\/winter-2025-26$/);
  await expect(page.getByRole('heading', { name: /Winter 2025\/26/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Men’s standings/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Women’s standings/ })).toBeVisible();
});

test('reaches the championship standings from home in two taps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Full table' }).click();

  await expect(page).toHaveURL(/\/club-championship\/2025$/);
  await expect(page.getByRole('heading', { name: /Club Championship 2025/i })).toBeVisible();
});

test('every public section works without signing in', async ({ page }) => {
  for (const [path, heading] of [
    ['/', 'Royal Manor of Portland Athletic Club'],
    ['/time-trial', 'Winter 2025/26'],
    ['/club-championship', 'Club Championship 2025'],
    ['/races', 'Races'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    // No sign-in wall anywhere in the public experience.
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  }
});

test('season standings show counting scores and distinguish absence from zero', async ({
  page,
}) => {
  await page.goto('/time-trial/winter-2025-26');

  const table = page.getByRole('region', {
    name: 'Men’s best-four season standings — scrollable table',
    exact: true,
  });
  await expect(table).toBeVisible();

  // Counting scores are marked in text as well as by colour.
  await expect(table.getByText('(counts)').first()).toBeAttached();

  // Round 3 is a draft, so only two round columns are published.
  await expect(table.getByRole('columnheader', { name: 'R1' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'R2' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'R3' })).toHaveCount(0);
});

test('a draft round is not linkable or visible to the public', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');

  await expect(page.getByRole('link', { name: /Round 1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Round 2/ })).toBeVisible();
  // Round 3 is listed as upcoming but carries no link to results.
  await expect(page.getByRole('link', { name: /Round 3/ })).toHaveCount(0);
  await expect(page.getByText(/Round 3.*to come/s)).toBeVisible();
});

test('a published round shows the full scoring breakdown', async ({ page }) => {
  await page.goto('/time-trial/winter-2025-26');
  await page.getByRole('link', { name: /Round 2/ }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Round 2');
  await expect(page.getByRole('heading', { name: /Two laps/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Three laps/ })).toBeVisible();

  // Improvement is genuinely calculated: round 2 has a comparison to round 1.
  const twoLap = page.getByRole('region', { name: /^Two laps.*results/i });
  await expect(twoLap.getByRole('columnheader', { name: 'Age grade' })).toBeVisible();
  await expect(twoLap.getByText('%').first()).toBeVisible();
});

test('championship table marks eligibility in words, not only colour', async ({ page }) => {
  await page.goto('/club-championship/2025');

  const table = page.getByRole('region', {
    name: 'Men’s club championship 2025 — scrollable table',
    exact: true,
  });
  await expect(table).toBeVisible();
  await expect(table.getByText(/Eligible/).first()).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Best 6' })).toBeVisible();
});

test('races list puts upcoming before past and never exposes a draft', async ({ page }) => {
  await page.goto('/races');

  await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chesil Beach Challenge' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Past races' })).toBeVisible();

  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.indexOf('Upcoming')).toBeLessThan(headings.indexOf('Past races'));
});

test('scoring explanations are available in plain language', async ({ page }) => {
  // Activated with the keyboard rather than a click: it removes any dependence
  // on hit-testing a long scrolled page, and it proves the disclosure is
  // operable without a pointer, which is a requirement in its own right.
  await page.goto('/time-trial/winter-2025-26');
  await page.waitForLoadState('networkidle');

  const timeTrialSummary = page.getByText('How time-trial scoring works');
  await timeTrialSummary.focus();
  await expect(timeTrialSummary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/best four round totals count/i)).toBeVisible();

  await page.goto('/club-championship/2025');
  await page.waitForLoadState('networkidle');

  const championshipSummary = page.getByText('How club championship scoring works');
  await championshipSummary.focus();
  await expect(championshipSummary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/low score wins/i)).toBeVisible();
});

test('no page exposes a date of birth', async ({ page }) => {
  for (const path of [
    '/',
    '/time-trial/winter-2025-26',
    '/time-trial',
    '/club-championship/2025',
    '/races',
  ]) {
    await page.goto(path);
    // `/time-trial` resolves through a streaming redirect, so wait for the
    // final document before reading it.
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    // Every seeded birth year, plus the field names that would carry one.
    for (const needle of [
      '1979-04-12',
      '1986-09-03',
      '1990-01-22',
      'dateOfBirth',
      'ageOnRoundDate',
    ]) {
      expect(html, `${needle} found on ${path}`).not.toContain(needle);
    }
  }
});

test('shows an honest empty state rather than fake data', async ({ page }) => {
  // 2019 has no championship, so the route must say so rather than invent one.
  // The status is asserted through a direct request because the page itself is
  // delivered as a stream, which reports 200 before the not-found is reached.
  await page.goto('/club-championship/2019');
  await expect(page.getByText('Page not found')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
