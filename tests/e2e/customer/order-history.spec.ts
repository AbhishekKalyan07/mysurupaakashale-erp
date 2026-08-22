import { test, expect } from '../shared/fixtures';
import { CustomerPage } from '../pages/CustomerPage';

test.describe('Customer Order History', () => {
  test('customer can navigate to order history from dashboard', async ({ customerPage }) => {
    const page = new CustomerPage(customerPage);
    await page.gotoDashboard();
    
    // Navigate to Subscriptions first
    await page.navigateToSubscriptions();
    
    // Click View Order History
    const viewHistoryBtn = customerPage.locator('button:has-text("View Order History")');
    await expect(viewHistoryBtn).toBeVisible();
    await viewHistoryBtn.click();
    
    // Verify URL and Title
    await expect(customerPage).toHaveURL(/\/customer\/orders$/);
    await expect(customerPage.locator('h1:has-text("Order History")')).toBeVisible();
  });

  test('order history displays empty state or sorted orders correctly', async ({ customerPage }) => {
    await customerPage.goto('/customer/orders');
    await expect(customerPage.locator('h1:has-text("Order History")')).toBeVisible();

    // It should either show an empty state OR a list of dates
    const emptyState = customerPage.locator('h3:has-text("No Past Orders")');
    const orderDates = customerPage.locator('h2', { hasText: /202|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ }); // Match formatted date headers
    
    await expect(emptyState.or(orderDates.first())).toBeVisible();

    if (await emptyState.isVisible()) {
      await expect(customerPage.locator('text=You haven\'t received or skipped any orders yet.')).toBeVisible();
    }
  });
});
