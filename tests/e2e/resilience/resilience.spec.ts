import { test, expect } from '../shared/fixtures';

test.describe('Offline and Resilience Checks', () => {
  test('gracefully handles offline mode', async ({ customerPage }) => {
    await customerPage.goto('/customer');
    await expect(customerPage.locator('h1', { hasText: 'Customer' })).toBeVisible();

    // Go offline
    await customerPage.context().setOffline(true);
    
    // Attempt an action that requires network or verify offline banner
    // The app might show an offline banner
    await expect(customerPage.getByRole('heading', { name: "You're Offline" })).toBeVisible({ timeout: 5000 });
    
    // Go online
    await customerPage.context().setOffline(false);
  });
});
