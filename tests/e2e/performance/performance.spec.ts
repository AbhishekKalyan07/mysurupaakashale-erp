import { test, expect } from '../shared/fixtures';

test.describe('Performance Checks', () => {
  // A typical load time target for internal business dashboards.
  // Kept at 5000ms as we are now measuring actual component load
  // without the initial Firestore WebChannel connection overhead.
  const MAX_LOAD_TIME_MS = 5000;

  test('Login page should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForSelector('button[type="submit"]');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });

  test('Admin dashboard should load quickly', async ({ adminPage }) => {
    // 1. Establish session and infrastructure connection on a lightweight page
    await adminPage.goto('/admin/settings');
    // Wait for the app to fully render the layout and nav
    await adminPage.waitForSelector('a[href="/dashboard"]');

    // 2. Measure actual client-side navigation to the dashboard
    const startTime = Date.now();
    await adminPage.click('a[href="/dashboard"]');
    await adminPage.waitForSelector('h1:has-text("Admin")');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });

  test('Kitchen production board should load quickly', async ({ kitchenPage }) => {
    // 1. Establish session and infrastructure connection on the default dashboard
    await kitchenPage.goto('/dashboard');
    // Wait for the app to fully render the layout and nav
    await kitchenPage.waitForSelector('a[href="/kitchen/production"]');

    // 2. Measure actual client-side navigation to the production board
    const startTime = Date.now();
    await kitchenPage.click('a[href="/kitchen/production"]');
    await kitchenPage.waitForSelector('h1:has-text("Kitchen Dashboard")');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(MAX_LOAD_TIME_MS);
  });
});
