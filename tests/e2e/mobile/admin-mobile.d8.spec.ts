import { test, expect } from '../shared/fixtures';
import { LoginPage } from '../pages/LoginPage';

test.describe('Admin Mobile & PWA Optimization (D.8)', () => {
  // Mobile viewports to test
  const MOBILE_VIEWPORTS = [
    { name: '320px (Narrow)', width: 320, height: 568 },
    { name: '360px (Standard)', width: 360, height: 740 },
    { name: '390px (iPhone 14)', width: 390, height: 844 },
    { name: '414px (Large Mobile)', width: 414, height: 896 },
  ];

  test('1. Admin mobile login flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('admin@test.com');
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('2. Admin mobile navigation: hamburger menu, sidebar, bottom nav, and more drawer', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/dashboard');
    await adminPage.waitForSelector('h1', { timeout: 20000 });

    // Verify Hamburger button is visible on mobile navbar
    const hamburgerBtn = adminPage.locator('header button[aria-label="Open menu"]');
    await expect(hamburgerBtn).toBeVisible();

    // Open slide-in sidebar
    await hamburgerBtn.click();
    const sidebar = adminPage.locator('aside');
    await expect(sidebar).toBeVisible();

    // Verify important Admin navigation links are accessible in sidebar
    await expect(sidebar.locator('a[href="/dashboard"]').first()).toBeVisible();
    await expect(sidebar.locator('a[href="/admin/customers"]').first()).toBeVisible();
    await expect(sidebar.locator('a[href="/admin/subscriptions"]').first()).toBeVisible();
    await expect(sidebar.locator('a[href="/admin/orders"]').first()).toBeVisible();
    await expect(sidebar.locator('a[href="/admin/accounts"]').first()).toBeVisible();

    // Close sidebar via close button
    const closeBtn = sidebar.locator('button[aria-label="Close Sidebar"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }

    // Verify BottomNav is present on mobile
    const bottomNav = adminPage.locator('nav[aria-label="Mobile navigation"]');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(bottomNav.locator('a[href="/admin/orders"]')).toBeVisible();

    // Open "More" drawer from BottomNav
    const moreBtn = bottomNav.locator('button:has-text("More")');
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      // Ensure more drawer items are visible
      await expect(adminPage.locator('button[aria-label="Customers"]')).toBeVisible();
      await expect(adminPage.locator('button[aria-label="Subscriptions"]')).toBeVisible();
      await expect(adminPage.locator('button[aria-label="Accounts"]')).toBeVisible();

      // Close More drawer
      const closeMoreBtn = adminPage.locator('button[aria-label="Close menu"]');
      if (await closeMoreBtn.isVisible()) {
        await closeMoreBtn.click();
      }
    }
  });

  test('3. Admin Dashboard layout without horizontal overflow at mobile widths', async ({ adminPage }) => {
    for (const vp of MOBILE_VIEWPORTS) {
      await adminPage.setViewportSize({ width: vp.width, height: vp.height });
      await adminPage.goto('/dashboard');
      await adminPage.waitForSelector('h1', { timeout: 20000 });

      // Verify no horizontal overflow in the main content container
      const main = adminPage.locator('main');
      const isOverflowing = await main.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
      expect(isOverflowing, `Dashboard should not horizontally overflow at ${vp.name}`).toBe(false);

      // Verify metrics cards are rendered and visible
      await expect(adminPage.locator('text=Total Customers').first()).toBeVisible();
      await expect(adminPage.locator('text=Total Orders').first()).toBeVisible();
    }
  });

  test('4. Admin Customer Management mobile cards and search', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    // Verify search input is visible and fits within viewport
    const searchInput = adminPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // Verify no horizontal overflow
    const main = adminPage.locator('main');
    const isOverflowing = await main.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(isOverflowing, 'Customers page should not horizontally overflow').toBe(false);

    // Filter tabs are visible
    await expect(adminPage.locator('button:has-text("All")').first()).toBeVisible();
  });

  test('5. Representative Dialog: CustomerDetailDialog usability on mobile', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    // Click first customer card or row if available to open dialog
    const customerItem = adminPage.locator('.cursor-pointer').first();
    if (await customerItem.isVisible()) {
      await customerItem.click();

      // Wait for Customer Details dialog to appear
      const dialog = adminPage.locator('h2:has-text("Customer Details")');
      if (await dialog.isVisible()) {
        // Verify dialog fits within viewport
        const dialogBox = await adminPage.locator('div[role="tabpanel"]').boundingBox();
        if (dialogBox) {
          expect(dialogBox.width).toBeLessThanOrEqual(390);
        }

        // Test switching tabs inside dialog
        const subsTab = adminPage.locator('button[role="tab"]:has-text("Subscriptions")');
        if (await subsTab.isVisible()) {
          await subsTab.click();
        }

        const ordersTab = adminPage.locator('button[role="tab"]:has-text("Order History")');
        if (await ordersTab.isVisible()) {
          await ordersTab.click();
        }

        const accountTab = adminPage.locator('button[role="tab"]:has-text("Account & Billing")');
        if (await accountTab.isVisible()) {
          await accountTab.click();
        }

        // Close dialog via close button
        const closeDialogBtn = adminPage.locator('button[aria-label="Close"]').first();
        if (await closeDialogBtn.isVisible()) {
          await closeDialogBtn.click();
          await expect(dialog).not.toBeVisible();
        }
      }
    }
  });

  test('6. Admin Order Management on mobile', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/orders');
    await adminPage.waitForSelector('h1:has-text("Orders")', { timeout: 20000 });

    // Verify search and filter toggle
    await expect(adminPage.locator('input[placeholder*="Search"]')).toBeVisible();

    // Verify status KPI chips are rendered
    await expect(adminPage.locator('button:has-text("All")').first()).toBeVisible();

    // Verify no horizontal page blowout
    const main = adminPage.locator('main');
    const isOverflowing = await main.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(isOverflowing, 'Orders page should not horizontally overflow').toBe(false);
  });

  test('7. Admin Accounts / Billing on mobile', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/accounts');
    await adminPage.waitForSelector('h1:has-text("Accounts")', { timeout: 20000 });

    // Verify Financial Reports section
    await expect(adminPage.getByRole('heading', { name: 'Financial Reports' })).toBeVisible();

    // Verify Manual Invoice form inputs are visible
    await expect(adminPage.getByRole('heading', { name: 'Generate Manual Invoice' })).toBeVisible();
    await expect(adminPage.locator('button:has-text("Create Invoice")')).toBeVisible();

    // Verify no horizontal overflow
    const main = adminPage.locator('main');
    const isOverflowing = await main.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(isOverflowing, 'Accounts page should not horizontally overflow').toBe(false);
  });

  test('8. Desktop Viewport Regression: Desktop navigation and layout remain intact', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1280, height: 800 });
    await adminPage.goto('/dashboard');
    await adminPage.waitForSelector('h1', { timeout: 20000 });

    // Desktop sidebar is statically visible
    const sidebar = adminPage.locator('aside');
    await expect(sidebar).toBeVisible();

    // Hamburger button is hidden on desktop
    const hamburgerBtn = adminPage.locator('header button[aria-label="Open menu"]');
    await expect(hamburgerBtn).toBeHidden();

    // Bottom navigation is hidden on desktop
    const bottomNav = adminPage.locator('nav[aria-label="Mobile navigation"]');
    await expect(bottomNav).toBeHidden();

    // Navigate to customers page on desktop
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    // Desktop table view should be visible on desktop
    const desktopTable = adminPage.locator('table');
    await expect(desktopTable).toBeVisible();
  });
});
