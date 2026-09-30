import { test, expect } from "../shared/fixtures";

test.describe("Admin Call-Center — Today's Meal & Add-on Control E2E", () => {
  test("Admin call-center phone operations workflow: inspect, cancel, add, change option, add add-on", async ({
    adminPage,
  }) => {
    // 1. Admin navigates to customers page
    await adminPage.goto("/admin/customers");
    await expect(adminPage).toHaveURL(/.*\/admin\/customers/);

    // 2. Open first customer details dialog
    const firstRow = adminPage.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    // 3. Customer Details dialog opens
    const dialogTitle = adminPage.locator('h2:has-text("Customer Details")');
    await expect(dialogTitle).toBeVisible();

    // 4. Verify Today's Meals tab exists and click it
    const todayTab = adminPage.locator('button[role="tab"]:has-text("Today\'s Meals")');
    await expect(todayTab).toBeVisible();
    await todayTab.click();

    // Verify Today's Meals header is rendered
    await expect(
      adminPage.locator('h3:has-text("Today\'s Meals")'),
    ).toBeVisible({ timeout: 10000 });

    // Verify meals section is present (Breakfast, Lunch, Dinner)
    await expect(adminPage.locator('text="Breakfast"').first()).toBeVisible();
    await expect(adminPage.locator('text="Lunch"').first()).toBeVisible();
    await expect(adminPage.locator('text="Dinner"').first()).toBeVisible();

    // 5. Test Add-on Modal opening & Authoritative Calculation Preview
    const addAddonBtn = adminPage.locator('button:has-text("Add Today\'s Add-on")').first();
    if (await addAddonBtn.isVisible()) {
      await addAddonBtn.click();

      // Verify Add-on modal is open
      const addonModalTitle = adminPage.locator('h3:has-text("Add Today\'s Add-on Item")');
      await expect(addonModalTitle).toBeVisible();

      // Verify authoritative calculation is displayed
      await expect(adminPage.locator('text="Authoritative Calculation:"')).toBeVisible();
      await expect(adminPage.locator('text="Total Invoice Charge:"')).toBeVisible();

      // Close modal
      const cancelBtn = adminPage.locator('button:has-text("Cancel")').last();
      await cancelBtn.click();
      await expect(addonModalTitle).not.toBeVisible();
    }

    // 6. Test Remove Meal confirmation modal if a meal is scheduled
    const removeBtn = adminPage.locator('button:has-text("Remove")').first();
    if (await removeBtn.isVisible() && !(await removeBtn.isDisabled())) {
      await removeBtn.click();

      // Confirmation modal opens
      const removeModal = adminPage.locator('h3:has-text("Remove Today\'s")');
      await expect(removeModal).toBeVisible();

      // Shows cancellation adjustment preview
      await expect(adminPage.locator('text="Cancellation Adjustment:"')).toBeVisible();

      // Cancel modal without executing destructive mutation
      const modalCancel = adminPage.locator('button:has-text("Cancel")').last();
      await modalCancel.click();
      await expect(removeModal).not.toBeVisible();
    }

    // 7. Test Change Option modal if available
    const changeOptionBtn = adminPage.locator('button:has-text("Change Option")').first();
    if (await changeOptionBtn.isVisible() && !(await changeOptionBtn.isDisabled())) {
      await changeOptionBtn.click();

      const changeModal = adminPage.locator('h3:has-text("Change Today\'s")');
      await expect(changeModal).toBeVisible();

      // Shows price difference: ₹0
      await expect(adminPage.locator('text="Price Difference:"')).toBeVisible();
      await expect(adminPage.locator('text=₹0')).toBeVisible();

      // Close modal
      const modalCancel = adminPage.locator('button:has-text("Cancel")').last();
      await modalCancel.click();
      await expect(changeModal).not.toBeVisible();
    }

    // 8. Verify switching to Subscriptions tab reveals distinct lifecycle controls
    const subTab = adminPage.locator('button[role="tab"]:has-text("Subscriptions")');
    await subTab.click();
    await expect(subTab).toHaveAttribute("aria-selected", "true");

    // Check for Subscription Controls section if subscription exists
    const subControls = adminPage.locator('text="Subscription Controls"').first();
    if (await subControls.isVisible()) {
      await expect(adminPage.locator('text="Auto-Renew"').first()).toBeVisible();
      await expect(adminPage.locator('text="Stop / Cancel"').first()).toBeVisible();
    }

    // 9. Verify Order History tab is still intact
    const orderHistoryTab = adminPage.locator('button[role="tab"]:has-text("Order History")');
    await orderHistoryTab.click();
    await expect(orderHistoryTab).toHaveAttribute("aria-selected", "true");

    // 10. Verify Account & Billing tab is still intact
    const accountTab = adminPage.locator('button[role="tab"]:has-text("Account & Billing")');
    await accountTab.click();
    await expect(accountTab).toHaveAttribute("aria-selected", "true");
  });
});
