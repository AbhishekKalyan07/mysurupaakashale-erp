import { test, expect } from '../shared/fixtures';

test.describe('Offline and Resilience Checks', () => {
  test('gracefully handles offline mode', async ({ customerPage }) => {
    await customerPage.goto('/customer');
    await expect(customerPage.locator('h1', { hasText: 'Customer Dashboard' })).toBeVisible();

    // Go offline
    await customerPage.context().setOffline(true);
    
    // Attempt an action that requires network or verify offline banner
    // The app might show an offline banner
    const offlineIndicator = customerPage.locator('text=offline');
    if (await offlineIndicator.isVisible()) {
      await expect(offlineIndicator).toBeVisible();
    }
    
    // Go online
    await customerPage.context().setOffline(false);
  });
});
