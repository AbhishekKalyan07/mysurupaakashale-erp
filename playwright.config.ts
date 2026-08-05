import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5174',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',

    /* Generous timeouts: Firestore emulator WebChannel can take several
     * seconds to establish its first connection. Without this, tests that
     * wait for data-driven UI (like dashboard KPI cards) fail spuriously. */
    actionTimeout: 20000,
  },

  /* Global assertion timeout — overrides the default 5 s. */
  expect: {
    timeout: 20000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15'] },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 8'] },
      dependencies: ['setup'],
    },
    {
      name: 'iPad',
      use: { ...devices['iPad (gen 7)'] },
      dependencies: ['setup'],
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        VITE_USE_FIREBASE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: 'demo-test',
        VITE_FIREBASE_API_KEY: 'fake-api-key'
      }
    },
    {
      command: 'npx firebase emulators:start --project demo-test --only auth,firestore',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    }
  ],
});
