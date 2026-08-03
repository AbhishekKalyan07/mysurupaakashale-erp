import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Authentication & Security', () => {
  // Test invalid login
  test('should show error on invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('invalid@test.com', 'wrongpassword');
    // Use role=alert — more robust than matching exact error text which can vary by emulator version
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  // Test successful login and redirect based on role
  test('admin should be redirected to admin dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin@test.com', 'password123');
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('h1', { hasText: 'Admin' })).toBeVisible();
  });

  test('customer should be redirected to customer dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('customer@test.com', 'password123');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  // Test route protection (Unauthenticated)
  test('unauthenticated users should be redirected to login', async ({ page }) => {
    // Navigate to a protected route (not /admin which is a 404)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*login/);
  });
});
