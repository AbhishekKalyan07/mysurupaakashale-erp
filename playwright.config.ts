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
  /* Opt out of parallel tests on CI or local emulator to prevent dirty database state collisions */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:5174',

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
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev -- --port 5174 --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
      env: {
        VITE_USE_FIREBASE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: 'demo-test',
        VITE_FIREBASE_API_KEY: 'fake-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
        VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
        VITE_FIREBASE_APP_ID: '1:1234567890:web:1234567890',
      }
    },
    // In CI, emulators are started externally by firebase emulators:exec in the workflow.
    // Locally, Playwright starts them via this webServer entry.
    ...(!process.env.CI ? [{
      command: 'npx firebase emulators:start --project demo-test --only auth,firestore',
      port: 8085,
      reuseExistingServer: true,
      timeout: 300000,
    }] : []),
  ],
});
