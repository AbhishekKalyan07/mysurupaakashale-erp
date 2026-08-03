import { test, expect } from '../shared/fixtures';

test.describe('Security & Role Protection', () => {
  // Test customer trying to access admin
  test('customer cannot access admin pages', async ({ customerPage }) => {
    await customerPage.goto('/admin/dashboard');
    // Assuming unauthorized access redirects to dashboard or login
    await expect(customerPage).not.toHaveURL(/.*admin/);
  });

  // Test kitchen trying to access admin
  test('kitchen cannot access admin settings', async ({ kitchenPage }) => {
    await kitchenPage.goto('/admin/settings');
    await expect(kitchenPage).not.toHaveURL(/.*settings/);
  });
});
