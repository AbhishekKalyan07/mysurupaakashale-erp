import { test, expect } from '../shared/fixtures';

test.describe('Performance Checks', () => {
  // A typical load time target for internal business dashboards.
  // Increased to 5000ms because the initial Firestore WebChannel connection 
  // in headless Playwright Chromium often takes ~3-4 seconds.
  const MAX_LOAD_TIME_MS = 5000;

  test('Login page should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForSelector('button[type="submit"]');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });

  test('Admin dashboard should load quickly', async ({ adminPage }) => {
    const startTime = Date.now();
    await adminPage.goto('/dashboard');
    await adminPage.waitForSelector('h1:has-text("Admin")');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });

  test('Kitchen production board should load quickly', async ({ kitchenPage }) => {
    const startTime = Date.now();
    await kitchenPage.goto('/kitchen/production');
    await kitchenPage.waitForSelector('h1:has-text("Production Board")');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });
});
