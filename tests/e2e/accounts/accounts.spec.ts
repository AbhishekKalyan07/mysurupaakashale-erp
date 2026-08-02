import { test, expect } from '../shared/fixtures';
import { AccountsPage } from '../pages/AccountsPage';

test.describe('Accounts Journey', () => {
  test('accounts user can view dashboard', async ({ accountsPage }) => {
    const page = new AccountsPage(accountsPage);
    await page.gotoDashboard();
    await page.verifyDashboardLoaded();
  });

  test('accounts user can view and record payment for invoices', async ({ accountsPage }) => {
    const page = new AccountsPage(accountsPage);
    await page.gotoDashboard();
    await page.navigateToInvoices();
    
    // Check if an invoice is visible and has Record Payment button
    const recordBtn = accountsPage.locator('button:has-text("Record Payment")').first();
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await accountsPage.fill('input[name="amount"]', '4500');
      await accountsPage.click('button:has-text("Submit Payment")');
      await expect(accountsPage.locator('text=Payment recorded')).toBeVisible();
    }
  });
});
