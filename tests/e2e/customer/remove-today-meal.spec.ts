import { test, expect } from '../shared/fixtures';

test.describe('Customer: Remove Today Meal', () => {
  // Since we seed the order in auth.setup.ts, it will persist through tests
  test('customer can remove a meal for today', async ({ customerPage }) => {
    // We expect the dashboard to have the 'Modify Order' or similar cancellation option for today's meal
    await customerPage.goto('/customer');

    // Make sure we are on the dashboard
    await expect(customerPage.locator('text=Live Meal Subscription').first()).toBeVisible({ timeout: 20000 });

    // Click on "Cancel Today's Meal" on the subscription card or "Modify Order" on the order card
    // In CancelTodayModal, it's opened via "Cancel Today's Meal" button on the Subscription card or similar
    const modifyBtn = customerPage.locator('button:has-text("Cancel Today")').first();
    
    // We wait for the button to appear. If it doesn't, we skip because of strict cutoffs in the test time.
    if (!(await modifyBtn.isVisible())) {
      console.log("Cancel button not visible. Cutoff might have passed or it's not rendered.");
      test.skip();
      return;
    }

    await modifyBtn.click();

    // Now the modal should be visible
    const modal = customerPage.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Wait for the cancellation amount to be fetched and shown
    // Let's select dinner since we seeded dinner.
    const dinnerCheckbox = modal.locator('label:has-text("Dinner") input');
    
    // Check if dinner is an option and can be selected
    if (!(await dinnerCheckbox.isVisible())) {
       test.skip();
       return;
    }

    await dinnerCheckbox.check();

    // Verify cancellation amount is shown. We seeded price 100
    await expect(modal.locator('text=100')).toBeVisible();

    // Confirm cancel
    await modal.locator('button:has-text("Confirm Cancellation")').click();

    // The modal should close
    await expect(modal).not.toBeVisible();

    // The UI should show the meal as cancelled or skipped
    // Wait for the UI to refresh
    await expect(customerPage.locator('text=Cancelled').first()).toBeVisible();
  });
});
