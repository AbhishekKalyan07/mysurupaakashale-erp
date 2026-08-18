import { test as setup, expect } from '@playwright/test';
import { setupData } from './shared/setupData';

setup.describe.configure({ mode: 'serial' });

const roles = ['admin', 'kitchen', 'delivery', 'customer', 'accounts'] as const;

setup('Initialize test data', async () => {
  await setupData();
});

roles.forEach(role => {
  setup(`authenticate ${role}`, async ({ page }) => {
    setup.setTimeout(60000);

    // Navigate to the root — the app will redirect to /login for unauthenticated users.
    // firebase.ts sets browserLocalPersistence in emulator mode, so the resulting
    // auth token is stored in localStorage (not IndexedDB), which means
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('response', response => {
      if (!response.ok()) {
        console.log('HTTP ERROR:', response.status(), response.url());
        response.text().then(text => console.log('ERROR BODY:', text)).catch(() => {});
      }
    });
    await page.goto('/');
    await page.waitForURL(/.*login/, { timeout: 10000 });

    await page.fill('input[type="email"]', `${role}@test.com`);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait until the dashboard loads (URL leaves /login)
    await expect(page).not.toHaveURL(/.*login/, { timeout: 20000 });

    // Save authentication state — captures cookies + localStorage (including
    // the Firebase auth token now that we use browserLocalPersistence).
    await page.context().storageState({ path: `tests/e2e/.auth/${role}.json` });
  });
});
