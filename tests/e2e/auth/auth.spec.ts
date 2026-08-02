import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Authentication & Security', () => {
  // Test invalid login
  test('should show error on invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('invalid@test.com', 'wrongpassword');
    // Assuming the app shows an error message like "Invalid email or password"
    await expect(page.locator('text=Invalid')).toBeVisible();
  });

  // Test successful login and redirect based on role
  test('admin should be redirected to admin dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin@test.com', 'password123');
    await expect(page).toHaveURL(/.*admin/);
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();
  });

  test('customer should be redirected to customer dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('customer@test.com', 'password123');
    await expect(page).toHaveURL(/.*customer/);
  });

  // Test route protection (Unauthenticated)
  test('unauthenticated users should be redirected to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/.*login/);
  });
});
