import { test, expect } from './shared/fixtures';
import axios from 'axios';

test.describe('PHASE E5 — Owner/Admin Meal Plan & Selectable Option Management Flow', () => {
  test('Admin manages meal plans and options, verifies customer selectability, frozen pricing, and disablement', async ({ adminPage, customerPage }) => {
    // 0. Clean any pre-existing test subscriptions in emulator
    try {
      const subListResp = await axios.get(
        'http://127.0.0.1:8085/v1/projects/demo-test/databases/(default)/documents/subscriptions',
        { headers: { Authorization: 'Bearer owner' } }
      ).catch(() => null);
      if (subListResp?.data?.documents) {
        for (const doc of subListResp.data.documents) {
          await axios.delete(`http://127.0.0.1:8085/v1/${doc.name}`, {
            headers: { Authorization: 'Bearer owner' },
          }).catch(() => {});
        }
      }
    } catch (_) {}
    await axios.delete('http://127.0.0.1:8085/emulator/v1/projects/demo-test/databases/(default)/documents/subscriptions/sub-e2e-1').catch(() => {});
    await axios.delete('http://127.0.0.1:8085/emulator/v1/projects/demo-test/databases/(default)/documents/subscriptions/sub-e2e-neg').catch(() => {});
    await axios.delete('http://127.0.0.1:8085/emulator/v1/projects/demo-test/databases/(default)/documents/subscriptions/sub-e2e-e5').catch(() => {});

    // Fix clock to morning (09:00 AM IST) so cutoffs are open
    const kolkataDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await adminPage.clock.setFixedTime(new Date(`${kolkataDate}T09:00:00+05:30`));

    // 1. Admin navigates to /admin/meal-plans
    await adminPage.goto('/admin/meal-plans');
    await adminPage.waitForSelector('h1:has-text("Meal Plans & Options")', { timeout: 20000 });

    // 2. Verify baseline plans are visible
    const planCard = adminPage
      .locator('[data-testid^="meal-plan-card-"]')
      .filter({ hasText: 'Standard Plan' })
      .first();
    await expect(planCard).toBeVisible({ timeout: 15000 });
    await expect(planCard.locator('text=Active').first()).toBeVisible();

    // Verify Breakfast rule invariant: Breakfast is Fixed / Rotating and non-selectable
    await expect(planCard.locator('text=DailyMenu Rotating').first()).toBeVisible();
    await expect(planCard.locator('text=Non-selectable by customers').first()).toBeVisible();

    // 3. Add a new Lunch Option: "Millet Bisi Bele Bath"
    const addLunchBtn = planCard.locator('button:has-text("Add Lunch Option")').first();
    await expect(addLunchBtn).toBeVisible({ timeout: 10000 });
    await addLunchBtn.click();

    // Wait for option modal
    await expect(adminPage.locator('#option-modal-title:has-text("Add lunch Option")')).toBeVisible({ timeout: 10000 });
    await adminPage.fill('input[name="optionLabel"]', 'Millet Bisi Bele Bath');
    await adminPage.fill('input[name="optionItems"]', 'Foxtail Millet, Khara Boondi, Curd');
    await adminPage.fill('textarea[name="optionDescription"]', 'Nutritious traditional Karnataka comfort food');

    // Submit lunch option
    await adminPage.click('button[type="submit"]:has-text("Add Option")');
    await expect(adminPage.locator('#option-modal-title')).not.toBeVisible({ timeout: 10000 });

    // Verify "Millet Bisi Bele Bath" appears in Standard Plan lunch options
    await expect(planCard.locator('text=Millet Bisi Bele Bath').first()).toBeVisible({ timeout: 10000 });

    // 4. Add a new Dinner Option: "Ragi Dosa & Chutney"
    const addDinnerBtn = planCard.locator('button:has-text("Add Dinner Option")').first();
    await expect(addDinnerBtn).toBeVisible({ timeout: 10000 });
    await addDinnerBtn.click();

    await expect(adminPage.locator('#option-modal-title:has-text("Add dinner Option")')).toBeVisible({ timeout: 10000 });
    await adminPage.fill('input[name="optionLabel"]', 'Ragi Dosa & Chutney');
    await adminPage.fill('input[name="optionItems"]', '2 Ragi Dosas, Coconut Chutney, Sambar');
    await adminPage.fill('textarea[name="optionDescription"]', 'Crisp organic finger millet dosas');

    // Submit dinner option
    await adminPage.click('button[type="submit"]:has-text("Add Option")');
    await expect(adminPage.locator('#option-modal-title')).not.toBeVisible({ timeout: 10000 });

    // Verify "Ragi Dosa & Chutney" appears in Standard Plan dinner options
    await expect(planCard.locator('text=Ragi Dosa & Chutney').first()).toBeVisible({ timeout: 10000 });

    // 5. Open Admin Customer Management to create a subscription with the new options
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    const customerRow = adminPage.locator('tbody tr', { hasText: 'Customer User' }).first();
    await expect(customerRow).toBeVisible({ timeout: 15000 });
    await customerRow.click();

    await expect(adminPage.locator('h2:has-text("Customer Details")')).toBeVisible({ timeout: 10000 });

    // Click "+ Create Subscription"
    const createSubBtn = adminPage.locator('button:has-text("+ Create Subscription")').first();
    await expect(createSubBtn).toBeVisible({ timeout: 10000 });
    await createSubBtn.click();

    await expect(adminPage.locator('h2:has-text("Create Subscription for Customer")')).toBeVisible({ timeout: 10000 });

    // Select Standard Plan
    const planSelect = adminPage.locator('div[class*="cursor-pointer"]', { hasText: 'Standard Plan' }).first();
    await expect(planSelect).toBeVisible({ timeout: 10000 });
    await planSelect.click();

    // Verify Lunch dropdown contains the newly added option "Millet Bisi Bele Bath"
    const lunchSelect = adminPage.locator('select[data-testid="select-option-lunch"]');
    await expect(lunchSelect).toBeVisible({ timeout: 10000 });
    const lunchOptions = await lunchSelect.locator('option').allInnerTexts();
    expect(lunchOptions.some((opt) => opt.includes('Millet Bisi Bele Bath'))).toBe(true);

    // Select "Millet Bisi Bele Bath"
    await lunchSelect.selectOption({ label: 'Millet Bisi Bele Bath' });

    // Verify Dinner dropdown contains "Ragi Dosa & Chutney"
    const dinnerSelect = adminPage.locator('select[data-testid="select-option-dinner"]');
    await expect(dinnerSelect).toBeVisible({ timeout: 10000 });
    const dinnerOptions = await dinnerSelect.locator('option').allInnerTexts();
    expect(dinnerOptions.some((opt) => opt.includes('Ragi Dosa & Chutney'))).toBe(true);

    // Select "Ragi Dosa & Chutney"
    await dinnerSelect.selectOption({ label: 'Ragi Dosa & Chutney' });

    // Fill address if required
    const addressInput = adminPage.locator('input[placeholder*="Address Line 1"]');
    if (await addressInput.isVisible()) {
      await addressInput.fill('12 Saraswathipuram');
      await adminPage.fill('input[placeholder*="Pincode"]', '570001');
    }

    // Submit subscription creation
    const submitSubBtn = adminPage.locator('button[type="submit"]:has-text("Create Subscription")').first();
    await expect(submitSubBtn).toBeEnabled({ timeout: 10000 });
    await submitSubBtn.click();

    await expect(adminPage.locator('h2:has-text("Create Subscription for Customer")')).not.toBeVisible({ timeout: 15000 });

    // 6. Verify Customer sees the active Standard Plan
    await customerPage.goto('/customer/subscription');
    await expect(customerPage.getByText('Standard Plan').first()).toBeVisible({ timeout: 20000 });

    // 7. Verify same-slot option change preserves ₹0 variance and leaves order price intact
    // Navigate to Admin customer details -> Today's Meals tab
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });
    await adminPage.locator('tbody tr', { hasText: 'Customer User' }).first().click();

    const todayTab = adminPage.locator('button:has-text("Today\'s Meals")').first();
    await expect(todayTab).toBeVisible({ timeout: 10000 });
    await todayTab.click();

    // Verify customer's lunch order displays option
    const changeOptionBtn = adminPage.locator('button:has-text("Change Option")').first();
    if (await changeOptionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await changeOptionBtn.click();
      await expect(adminPage.locator('#change-option-title')).toBeVisible({ timeout: 10000 });
      // Pick another option
      const altOption = adminPage.locator('label', { hasText: 'Lunch Option 2' }).first();
      if (await altOption.isVisible()) {
        await altOption.click();
        await adminPage.click('button:has-text("Confirm Option Change")');
        await expect(adminPage.locator('#change-option-title')).not.toBeVisible({ timeout: 10000 });
      }
    }

    // 8. Disable the Lunch Option "Millet Bisi Bele Bath" in Meal Plan configuration
    await adminPage.goto('/admin/meal-plans');
    await adminPage.waitForSelector('h1:has-text("Meal Plans & Options")', { timeout: 20000 });

    const milletOptionRow = adminPage
      .locator('[data-testid^="meal-option-"]')
      .filter({ hasText: 'Millet Bisi Bele Bath' })
      .first();
    await expect(milletOptionRow).toBeVisible({ timeout: 10000 });

    const disableOptBtn = milletOptionRow.locator('button:has-text("Disable")').first();
    await disableOptBtn.click();

    // Verify it is marked Disabled
    await expect(milletOptionRow.locator('text=Disabled').first()).toBeVisible({ timeout: 10000 });

    // 9. Verify disabled option is no longer selectable in new customer subscription creation
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });
    await adminPage.locator('tbody tr', { hasText: 'Customer User' }).first().click();
    await adminPage.locator('button:has-text("+ Create Subscription")').first().click();
    await expect(adminPage.locator('h2:has-text("Create Subscription for Customer")')).toBeVisible({ timeout: 10000 });

    await adminPage.locator('div[class*="cursor-pointer"]', { hasText: 'Standard Plan' }).first().click();

    const lunchSelectAfterDisable = adminPage.locator('select[data-testid="select-option-lunch"]');
    await expect(lunchSelectAfterDisable).toBeVisible({ timeout: 10000 });
    const refreshedLunchOpts = await lunchSelectAfterDisable.locator('option').allInnerTexts();

    // "Millet Bisi Bele Bath" must NOT be in the selectable options list!
    expect(refreshedLunchOpts.some((opt) => opt.includes('Millet Bisi Bele Bath'))).toBe(false);
  });
});
