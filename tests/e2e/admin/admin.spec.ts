import { test, expect } from '../shared/fixtures';
import { AdminPage } from '../pages/AdminPage';
import { createCustomer } from '../shared/api';

test.describe('Admin Journey', () => {
  test('admin can view dashboard KPIs', async ({ adminPage }) => {
    const page = new AdminPage(adminPage);
    await page.gotoDashboard();
    await page.verifyDashboardKPIs();
  });

});
