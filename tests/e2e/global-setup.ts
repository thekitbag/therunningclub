import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { e2eEnv } from './fixtures';

/**
 * Unlocks the club passcode once, and saves the resulting cookie.
 *
 * Production is gated, so the browser suite runs against a gated site too —
 * otherwise the tests would exercise a configuration that never ships. Every
 * spec starts from this saved state and therefore sees the site as a member
 * does. `gate.spec.ts` deliberately opts out of it to test the locked view.
 */
export const MEMBER_STATE = resolve(process.cwd(), 'tests/e2e/.auth/member.json');

export default async function globalSetup(config: FullConfig): Promise<void> {
  const env = e2eEnv();
  const passcode = env.SITE_PASSCODE;
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3100';

  mkdirSync(dirname(MEMBER_STATE), { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    if (!passcode) {
      // No gate configured: save an empty state so the suite still runs.
      await context.storageState({ path: MEMBER_STATE });
      return;
    }

    await page.goto('/unlock');
    await page.getByLabel('Club passcode').fill(passcode);
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/unlock'), { timeout: 30_000 });

    await context.storageState({ path: MEMBER_STATE });
  } finally {
    await browser.close();
  }
}
