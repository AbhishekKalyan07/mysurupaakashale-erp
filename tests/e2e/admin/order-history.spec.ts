import { test, expect } from '../shared/fixtures';
import { AdminPage } from '../pages/AdminPage';

test.describe('Admin Customer Order History', () => {
  test('admin can view a customer\'s order history from the customer detail dialog', async ({ adminPage }) => {
    const page = new AdminPage(adminPage);
    await page.gotoDashboard();
    
    // Navigate to Customers list
    await adminPage.goto('/admin/customers');
    
    // Click on the first customer to open the dialog
    const firstCustomerCard = adminPage.locator('tbody tr').first();
    await expect(firstCustomerCard).toBeVisible();
    await firstCustomerCard.click();
    
    // Dialog should open
    await expect(adminPage.locator('h2:has-text("Customer Details")')).toBeVisible();
    
    // Switch to Order History tab
    const orderHistoryTab = adminPage.locator('button:has-text("Order History")');
    await expect(orderHistoryTab).toBeVisible();
    await orderHistoryTab.click();
    
    // Verify content (either No History or an order card)
    const tabPanel = adminPage.locator('[role="tabpanel"]');
    const emptyState = tabPanel.locator('text="No order history available."');
    const orderCard = tabPanel.locator('.bg-background.rounded-xl').first();
    
    // Wait for one of them to be visible (solves race condition where data is still loading)
    await expect(emptyState.or(orderCard)).toBeVisible();
  });
});
