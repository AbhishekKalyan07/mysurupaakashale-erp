import { test, expect } from '../shared/fixtures';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Checks', () => {
  test('Login page should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/login');
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Admin dashboard should be accessible', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await adminPage.waitForSelector('h1:has-text("Dashboard")');
    const accessibilityScanResults = await new AxeBuilder({ page: adminPage }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Customer dashboard should be accessible', async ({ customerPage }) => {
    await customerPage.goto('/customer');
    const accessibilityScanResults = await new AxeBuilder({ page: customerPage }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
