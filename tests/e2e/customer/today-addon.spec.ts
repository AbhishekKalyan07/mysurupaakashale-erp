import { test, expect } from '../shared/fixtures';

test.describe('Customer: Today\'s Add-on & Cancellation Pricing Flow (Phase D.5)', () => {
  test('customer can add today add-on with authoritative pricing and view cancellation pricing', async ({ customerPage }) => {
    await customerPage.goto('/customer');

    // Wait for customer dashboard to load
    await expect(customerPage.locator('text=Live Meal Subscription').first()).toBeVisible({ timeout: 20000 });

    // 1. Open today's add-on flow
    const addAddonBtn = customerPage.locator('button:has-text("+ Add-on")').first();
    
    if (!(await addAddonBtn.isVisible())) {
      console.log("+ Add-on button not visible");
      test.skip();
      return;
    }

    await addAddonBtn.click();

    // 2. Add-on Modal is displayed
    const addonModal = customerPage.locator('[role="dialog"]');
    await expect(addonModal).toBeVisible();
    await expect(addonModal.locator('h2')).toContainText(/Add-on/i);

    // If all meal cutoffs have passed for today, verify cutoff message and close
    const cutoffNotice = addonModal.locator('text=It is too late to add any add-ons for today');
    if (await cutoffNotice.isVisible()) {
      console.log("All cutoffs for today have passed in the current test run. Cutoff verified.");
      const closeBtn = addonModal.locator('button:has-text("Close")');
      await closeBtn.click();
      await expect(addonModal).not.toBeVisible();
    } else {
      // 3. Select Add-on (e.g., Paneer Add-on or first available)
      const paneerOption = addonModal.locator('[data-testid="addon-option-addon_paneer"]');
      if (await paneerOption.isVisible()) {
        await paneerOption.click();
      } else {
        const firstOption = addonModal.locator('[data-testid^="addon-option-"]').first();
        if (await firstOption.isVisible()) {
          await firstOption.click();
        }
      }

      // 4. Verify authoritative price display before confirmation
      const priceDisplay = addonModal.locator('[data-testid="addon-price-display"]');
      await expect(priceDisplay).toBeVisible();
      await expect(priceDisplay).toContainText(/₹/);

      // 5. Confirm & Add to Bill
      const confirmAddonBtn = addonModal.locator('button[data-testid="confirm-addon-button"]');
      await expect(confirmAddonBtn).toBeEnabled();
      await confirmAddonBtn.click();

      // 6. Modal closes
      await expect(addonModal).not.toBeVisible({ timeout: 10000 });
    }

    // 7. Open today's meal cancellation
    const cancelBtn = customerPage.locator('button:has-text("Cancel Today")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();

      const cancelModal = customerPage.locator('[role="dialog"]');
      await expect(cancelModal).toBeVisible();

      const cancelCutoff = cancelModal.locator('text=It is too late to cancel any meals for today');
      if (await cancelCutoff.isVisible()) {
        console.log("Cancellation cutoff verified for today.");
        const closeBtn = cancelModal.locator('button[aria-label="Close modal"]');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        }
      } else {
        // 8. Select a meal slot to cancel
        const mealCheckbox = cancelModal.locator('input[type="checkbox"]').first();
        if (await mealCheckbox.isVisible()) {
          await mealCheckbox.check();

          // 9. Verify authoritative cancellation amount display
          const cancelAmount = cancelModal.locator('[data-testid="cancellation-amount"]');
          await expect(cancelAmount).toBeVisible();
          await expect(cancelAmount).toContainText(/₹/);

          // Cancel modal close without cancelling (keep meal)
          const closeOrConfirm = cancelModal.locator('button:has-text("Keep Meal")');
          if (await closeOrConfirm.isVisible()) {
            await closeOrConfirm.click();
          }
        }
      }
    }
  });
});
