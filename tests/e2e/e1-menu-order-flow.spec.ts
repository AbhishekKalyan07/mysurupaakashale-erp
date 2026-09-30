import { test, expect } from './shared/fixtures';
import { execSync } from 'child_process';
import path from 'path';

test.describe('PHASE E1 — Owner Daily Menu -> Order Integration Flow', () => {
  const FUTURE_DATE = '2026-11-20'; // Distinct future working day

  test('admin creates, edits, publishes future menu and connects to frozen order snapshot', async ({ adminPage }) => {
    // 1. Login as Admin / Open Daily Menu
    await adminPage.goto('/admin/menus');
    await adminPage.waitForSelector('h1:has-text("Daily Menus")', { timeout: 20000 });

    // 2. Click "Create Menu"
    await adminPage.click('button:has-text("Create Menu")');
    await expect(adminPage).toHaveURL(/\/admin\/menus\/new$/, { timeout: 15000 });

    // 3. Select a future date
    await adminPage.fill('input[type="date"]', FUTURE_DATE);

    // 4. Enter breakfast, lunch, and dinner dishes & items (all required by form schema)
    await adminPage.fill('input[name="breakfast.name"]', 'Mysuru Idli & Vada');
    await adminPage.getByPlaceholder('Item 1').nth(0).fill('2 Idlis, 1 Vada');

    const dishName = 'Special Paneer Biryani & Raita';
    const dishNotes = 'Dum-cooked paneer biryani with boondi raita';
    await adminPage.fill('input[name="lunch.name"]', dishName);
    await adminPage.fill('input[name="lunch.description"]', dishNotes);
    await adminPage.getByPlaceholder('Item 1').nth(1).fill('Paneer Biryani, Boondi Raita');

    await adminPage.fill('input[name="dinner.name"]', 'Wheat Chapati & Veg Kurma');
    await adminPage.getByPlaceholder('Item 1').nth(2).fill('3 Chapatis, Veg Kurma');

    // 5. Save draft
    await adminPage.click('button[type="submit"]:has-text("Create Draft")');
    await expect(adminPage).toHaveURL(/\/admin\/menus$/, { timeout: 15000 });

    // 6. Publish the future menu
    adminPage.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const publishBtn = adminPage.locator('button:has-text("Publish")').first();
    await expect(publishBtn).toBeVisible({ timeout: 10000 });
    await publishBtn.click();

    // Verify status changes to published (Archive button and published badge appear)
    await expect(adminPage.locator('button:has-text("Archive")').first()).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=published').first()).toBeVisible({ timeout: 10000 });

    // 7. Trigger/execute order generation for that future date in test environment
    const scriptPath = path.resolve(process.cwd(), 'scripts/generateDailyOrdersForDate.ts');
    execSync(`npx vite-node "${scriptPath}" ${FUTURE_DATE}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_USE_FIREBASE_EMULATORS: 'true',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test',
        VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'fake-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-test.firebaseapp.com',
        VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-test.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
        VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:1234567890',
      },
    });

    // 8. Open generated orders page
    await adminPage.goto('/admin/orders');
    await adminPage.waitForSelector('h1:has-text("Orders")', { timeout: 20000 });

    // Select the future date in the date picker
    const dateInput = adminPage.locator('input[type="date"]').first();
    await dateInput.fill(FUTURE_DATE);

    // Filter to Lunch meal type
    await adminPage.click('button:has-text("Filters")');
    await adminPage.click('button:has-text("Lunch")');

    // 9. Verify generated order contains the published menu content
    const detailsBtn = adminPage.locator('button:has-text("Details")').first();
    await expect(detailsBtn).toBeVisible({ timeout: 15000 });
    await detailsBtn.click();

    // Verify order modal details match the published menu snapshot
    const mealNameElem = adminPage.locator('[data-testid="order-meal-name"]');
    await expect(mealNameElem).toBeVisible({ timeout: 10000 });
    await expect(mealNameElem).toHaveText(dishName);
    await expect(adminPage.locator(`text=${dishNotes}`).first()).toBeVisible();

    // Close the details modal
    await adminPage.click('button[aria-label="Close"]');

    // 10. Attempt to modify Daily Menu afterward
    await adminPage.goto('/admin/menus');
    await adminPage.waitForSelector('h1:has-text("Daily Menus")', { timeout: 20000 });

    // Click Edit on the menu card
    const editBtn = adminPage.locator('a:has-text("Edit"), button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Verify menu is locked because orders already exist for that date
    await expect(adminPage.locator('text=Menu Locked')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('input[name="lunch.name"]')).toBeDisabled();
    await expect(adminPage.locator('button[type="submit"]')).toBeDisabled();
    await expect(adminPage.locator('button[type="submit"]')).toHaveText(/Locked/);

    // 11. Verify existing generated order remains unchanged
    await adminPage.goto('/admin/orders');
    await adminPage.waitForSelector('h1:has-text("Orders")', { timeout: 20000 });
    await adminPage.locator('input[type="date"]').first().fill(FUTURE_DATE);

    await adminPage.click('button:has-text("Filters")');
    await adminPage.click('button:has-text("Lunch")');

    const detailsBtnAgain = adminPage.locator('button:has-text("Details")').first();
    await expect(detailsBtnAgain).toBeVisible({ timeout: 15000 });
    await detailsBtnAgain.click();

    await expect(mealNameElem).toBeVisible({ timeout: 10000 });
    await expect(mealNameElem).toHaveText(dishName);
  });
});
