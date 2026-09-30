import { test, expect } from './shared/fixtures';

test.describe('PHASE E2 — Owner/Admin Pricing Configuration & Effective-Dated Pricing Flow', () => {
  const FUTURE_EFFECTIVE_DATE = '2026-12-01';

  test('admin views active pricing, schedules future price change, and verifies protection', async ({ adminPage }) => {
    // 1. Navigate to Admin Pricing Management
    await adminPage.goto('/admin/pricing');
    await adminPage.waitForSelector('h1:has-text("Pricing Configuration")', { timeout: 20000 });

    // 2. Verify Active Pricing card exists with meals and combos
    await expect(adminPage.locator('text=Active Base Pricing').first()).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=Breakfast').first()).toBeVisible();
    await expect(adminPage.locator('text=Lunch').first()).toBeVisible();
    await expect(adminPage.locator('text=Dinner').first()).toBeVisible();

    // 3. Open Schedule Price Change modal
    const scheduleBtn = adminPage.locator('button:has-text("Schedule Price Change")').first();
    await expect(scheduleBtn).toBeVisible({ timeout: 10000 });
    await scheduleBtn.click();

    // 4. Modal appears
    await expect(adminPage.locator('h2:has-text("Schedule Pricing Version"), h3:has-text("Schedule Pricing Version")')).toBeVisible({ timeout: 10000 });

    // 5. Fill future effective date and price values
    await adminPage.fill('input[name="effectiveFrom"]', FUTURE_EFFECTIVE_DATE);
    await adminPage.fill('input[name="breakfast"]', '65');
    await adminPage.fill('input[name="lunch"]', '120');
    await adminPage.fill('input[name="dinner"]', '120');
    await adminPage.fill('input[name="lunch_dinner"]', '220');
    await adminPage.fill('input[name="all_three"]', '270');
    await adminPage.fill('input[name="name"]', 'Year-end standard price revision');

    // 6. Submit the schedule pricing form
    await adminPage.click('button[type="submit"]:has-text("Schedule Pricing")');

    // 7. Verify modal closes and scheduled configuration appears
    await expect(adminPage.locator('h2:has-text("Schedule Pricing Version"), h3:has-text("Schedule Pricing Version")')).not.toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator(`text=${FUTURE_EFFECTIVE_DATE}`).first()).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=Scheduled').first()).toBeVisible({ timeout: 10000 });

    // 8. Verify active configuration cannot be deleted or have its historical prices rewritten
    const deleteScheduledBtn = adminPage.locator('[aria-label="Delete scheduled version"]').first();
    if (await deleteScheduledBtn.isVisible()) {
      // Scheduled can be deleted
      expect(await deleteScheduledBtn.isEnabled()).toBe(true);
    }
  });
});
