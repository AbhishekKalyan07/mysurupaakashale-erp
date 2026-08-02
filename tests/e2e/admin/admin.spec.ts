import { test, expect } from '../shared/fixtures';
import { AdminPage } from '../pages/AdminPage';
import { createCustomer } from '../shared/api';

test.describe('Admin Journey', () => {
  test('admin can view dashboard KPIs', async ({ adminPage }) => {
    const page = new AdminPage(adminPage);
    await page.gotoDashboard();
    await page.verifyDashboardKPIs();
  });

  test('admin can create a new customer', async ({ adminPage }) => {
    const page = new AdminPage(adminPage);
    await page.gotoDashboard();
    // Use UI to navigate and create a customer
    await page.navigateToCustomers();
    // Assuming button text
    await adminPage.click('button:has-text("Add Customer")');
    await adminPage.fill('input[name="name"]', 'New E2E Customer');
    await adminPage.fill('input[name="email"]', 'new.e2e@test.com');
    await adminPage.fill('input[name="phone"]', '9876543210');
    await adminPage.click('button:has-text("Save")');
    
    // Verify toast or success state
    await expect(adminPage.locator('text=Customer created successfully')).toBeVisible();
    
    // Verify it appears in the list
    await expect(adminPage.locator('text=New E2E Customer')).toBeVisible();
  });
});
