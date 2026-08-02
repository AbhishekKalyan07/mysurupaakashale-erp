import { test as setup, expect } from '@playwright/test';
import { setupData } from './shared/setupData';

setup.describe.configure({ mode: 'serial' });

const roles = ['admin', 'kitchen', 'delivery', 'customer', 'accounts'];

setup('Initialize test data', async () => {
  await setupData();
});

roles.forEach(role => {
  setup(`authenticate ${role}`, async ({ page }) => {
    setup.setTimeout(60000); // 60s timeout for auth setup
    await page.goto('/');
    
    await page.fill('input[type="email"]', `${role}@test.com`);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait until the dashboard loads and URL changes from /login
    await expect(page).not.toHaveURL(/.*login/, { timeout: 15000 });
    
    // Save authentication state
    await page.context().storageState({ path: `tests/e2e/.auth/${role}.json` });
  });
});
