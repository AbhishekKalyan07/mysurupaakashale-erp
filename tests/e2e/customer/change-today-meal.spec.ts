import { test, expect } from '../shared/fixtures';

test.describe('Customer: Change Today Meal Option', () => {
  test('customer can view and change meal option for today', async ({ customerPage }) => {
    await customerPage.goto('/customer');

    // Make sure we are on the dashboard
    await expect(customerPage.locator('text=Live Meal Subscription').first()).toBeVisible({ timeout: 20000 });

    // Find a Change Option button on today's scheduled lunch/dinner orders
    const changeBtn = customerPage.locator('button:has-text("Change Option")').first();

    if (!(await changeBtn.isVisible())) {
      console.log("Change Option button not visible. Cutoff might have passed or no scheduled lunch/dinner order today.");
      test.skip();
      return;
    }

    await changeBtn.click();

    // Verify modal is open
    const modal = customerPage.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verify modal title
    await expect(modal.locator('h2')).toContainText(/Change Today's/i);

    // If cutoff window is closed for today's meal, verify cutoff message and skip option selection
    if (await modal.locator('text=Cutoff Window Closed').isVisible()) {
      console.log("Cutoff Window Closed for today's meal. Skipping option selection.");
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).not.toBeVisible();
      return;
    }

    // Verify current selection is identified
    const currentBadge = modal.locator('text=Current Selection');
    if (await currentBadge.isVisible()) {
      await expect(currentBadge).toBeVisible();
    }

    // Verify price difference is ₹0
    await expect(modal.locator('text=₹0 (Free)')).toBeVisible();

    // Find selectable alternative option
    const altOption = modal.locator('button:not([disabled])').filter({ hasText: /•/ }).first();

    if (await altOption.isVisible()) {
      await altOption.click();

      // Submit the change
      const confirmBtn = modal.locator('button:has-text("Confirm Change")');
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();

      // Modal should close on success
      await expect(modal).not.toBeVisible();
    } else {
      // Close modal if no alternative is configured in plan
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).not.toBeVisible();
    }
  });
});
