import { expect, test, type Page } from '@playwright/test';
import { ADMIN, SECOND_ADMIN, resetAndSeed, type AdminAccount } from './fixtures';

/**
 * The full administrator journey the acceptance criteria describe:
 * sign in, create a runner, enter results, preview, publish, verify publicly,
 * correct, and see the recalculation.
 *
 * Runs on the desktop project only — administration is desktop-oriented by
 * design, and `playwright.config.ts` excludes `admin-*` specs from the phone
 * project.
 */

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => resetAndSeed());

async function signIn(page: Page, account: AdminAccount = ADMIN): Promise<void> {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('rejects bad credentials without revealing whether the account exists', async ({ page }) => {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const feedback = page.getByTestId('form-feedback');
  await expect(feedback).toContainText('Those sign-in details were not recognised');

  // An unknown address gives exactly the same message.
  await page.getByLabel('Email address').fill('nobody@example.invalid');
  await page.getByLabel('Password').fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('form-feedback')).toContainText(
    'Those sign-in details were not recognised',
  );
});

test('an unauthenticated visitor cannot reach administration', async ({ page }) => {
  for (const path of ['/admin', '/admin/runners', '/admin/time-trials', '/admin/administrators']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Sign in' }), path).toBeVisible();
  }
});

test('signs in, creates a runner, and sees it listed', async ({ page }) => {
  await signIn(page);

  await page.goto('/admin/runners');
  await page.getByLabel('First name').fill('Nia');
  await page.getByLabel('Last name').fill('Newcomer');
  await page.getByLabel('Date of birth').fill('1992-08-14');
  await page.getByLabel('Scoring category').selectOption('FEMALE');
  await page.getByRole('button', { name: 'Add runner' }).click();

  await expect(page.getByTestId('form-feedback')).toContainText('Runner created');
  await expect(page.getByRole('rowheader', { name: 'Nia Newcomer' })).toBeVisible();
});

test('warns about a possible duplicate before creating one', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/runners');

  await page.getByLabel('First name').fill('Nia');
  await page.getByLabel('Last name').fill('Newcomer');

  // The warning appears as the operator types, before they submit anything.
  await expect(page.getByText('Possible duplicate')).toBeVisible();
  await expect(page.getByText(/already ha[sv]e? this name/)).toContainText('Nia Newcomer');
});

test('enters results, previews the scores, and publishes the draft round', async ({ page }) => {
  await signIn(page);

  await page.goto('/admin/time-trials');
  await page.getByRole('link', { name: 'Winter 2025/26' }).click();
  await page.getByRole('link', { name: /Enter results for round 3/ }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Round 3');

  // Round 3 already has seeded results, so the calculated scores are visible
  // before publication — that is the preview the specification asks for.
  await expect(page.getByRole('heading', { name: 'Calculated scores' })).toBeVisible();
  const preview = page.locator('table.preview-table').first();
  await expect(preview.getByRole('columnheader', { name: 'Total' })).toBeVisible();

  // The impact panel shows what publishing will change, before it is clicked.
  await expect(page.getByText('Results in this round')).toBeVisible();
  await expect(page.getByText('Season totals changing')).toBeVisible();

  await page.getByRole('button', { name: 'Publish round' }).click();
  await expect(page.getByTestId('form-feedback')).toContainText('Round published');

  // And it is immediately public.
  await page.goto('/time-trial/winter-2025-26');
  await expect(page.getByRole('link', { name: /Round 3/ })).toBeVisible();
});

test('correcting a historical time recalculates the public standings', async ({ page }) => {
  await signIn(page);

  const menTable = page.getByRole('region', {
    name: 'Men’s best-four season standings — scrollable table',
    exact: true,
  });

  // Capture the whole published table before the correction.
  await page.goto('/time-trial/winter-2025-26');
  await expect(menTable).toBeVisible();
  const before = await menTable.innerText();

  // Make the round 1 leader dramatically slower.
  await page.goto('/admin/time-trials');
  await page.getByRole('link', { name: 'Winter 2025/26' }).click();
  await page.getByRole('link', { name: /Enter results for round 1/ }).click();

  await page.getByLabel('Time for row 1', { exact: true }).fill('45:00');
  await page.getByRole('button', { name: 'Save results' }).click();
  await expect(page.getByTestId('form-feedback')).toContainText('Saved');

  // The published table reflects the correction with no further action, and the
  // recalculated time itself is visible on the round page.
  await page.goto('/time-trial/winter-2025-26');
  await expect(menTable).toBeVisible();
  const after = await menTable.innerText();
  expect(after).not.toBe(before);

  await page.goto('/time-trial/winter-2025-26');
  await page.getByRole('link', { name: /Round 1/ }).click();
  await expect(page.getByText('45:00')).toBeVisible();
});

test('unpublishing a round removes it from the public site', async ({ page }) => {
  await signIn(page);

  await page.goto('/admin/time-trials');
  await page.getByRole('link', { name: 'Winter 2025/26' }).click();
  await page.getByRole('link', { name: /Enter results for round 3/ }).click();

  await page.getByRole('button', { name: 'Unpublish round' }).click();
  await expect(page.getByTestId('form-feedback')).toContainText('unpublished');

  await page.goto('/time-trial/winter-2025-26');
  await expect(page.getByRole('link', { name: /Round 3/ })).toHaveCount(0);
});

test('two administrators sign in independently and disabling one revokes only its access', async ({
  browser,
}) => {
  // Two full browser contexts, each doing a real password verification against
  // a deliberately slow KDF, so this journey needs more room than the default.
  test.slow();

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await signIn(first, ADMIN);
  await signIn(second, SECOND_ADMIN);

  // Both are genuinely signed in, in separate browser contexts.
  await expect(first.getByText(`Signed in as`)).toContainText(ADMIN.displayName);
  await expect(second.getByText(`Signed in as`)).toContainText(SECOND_ADMIN.displayName);

  // The first disables the second.
  await first.goto('/admin/administrators');
  await first
    .getByLabel('Administrator', { exact: true })
    .first()
    .selectOption({ label: `${SECOND_ADMIN.displayName} (active)` });
  await first.getByLabel('Set to').selectOption('DISABLED');
  await first.getByRole('button', { name: 'Update account' }).click();
  await expect(first.getByTestId('form-feedback')).toContainText(
    'every session they held has been revoked',
  );

  // The disabled administrator loses access on their next request.
  await second.goto('/admin/runners');
  await expect(second.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The first administrator is entirely unaffected.
  await first.goto('/admin/runners');
  await expect(first.getByRole('heading', { level: 1, name: 'Runners' })).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('admin pages are never cached and never expose a session cookie to script', async ({
  page,
}) => {
  await signIn(page);

  const response = await page.goto('/admin/runners');
  expect(response?.headers()['cache-control']).toContain('no-store');

  // The session cookie is HttpOnly, so page script cannot read it.
  const cookieVisibleToScript = await page.evaluate(() =>
    document.cookie.includes('rmpac_session'),
  );
  expect(cookieVisibleToScript).toBe(false);
});
