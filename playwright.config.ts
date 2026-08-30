import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/** Saved by global setup after entering the club passcode once. */
const MEMBER_STATE = resolve(process.cwd(), 'tests/e2e/.auth/member.json');

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], storageState: MEMBER_STATE },
    },
    {
      name: 'phone-chromium',
      use: { ...devices['Pixel 7'], storageState: MEMBER_STATE },
      testIgnore: /admin-.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: `node tests/e2e/start-server.mjs`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
    },
  },
});
