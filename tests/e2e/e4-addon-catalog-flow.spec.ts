import { test, expect } from './shared/fixtures';

test.describe('PHASE E4 — Owner/Admin Add-on Catalog & Frozen Order Pricing Flow', () => {
  test('Admin creates add-on, edits price, adds order with frozen price, updates catalog price, verifies freeze, and disables add-on', async ({ adminPage }) => {
    // Fix clock to morning (09:00 AM IST) so all meal slots are comfortably within cutoff windows
    const kolkataDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await adminPage.clock.setFixedTime(new Date(`${kolkataDate}T09:00:00+05:30`));

    // 1. Admin navigates to /admin/addons
    await adminPage.goto('/admin/addons');
    await adminPage.waitForSelector('h1:has-text("Add-on Catalog")', { timeout: 20000 });

    // Verify baseline add-ons are listed
    await expect(adminPage.locator('text=Medu Vada (1 pc)').first()).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=Paneer Add-on').first()).toBeVisible();

    // 2. Open Create Add-on modal
    const createBtn = adminPage.locator('button:has-text("Create Add-on")').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // 3. Fill and submit new add-on form
    await expect(adminPage.locator('h2:has-text("Create New Add-on")')).toBeVisible({ timeout: 10000 });
    await adminPage.fill('input[name="name"]', 'Special Papad');
    await adminPage.fill('input[name="price"]', '15');
    await adminPage.fill('textarea[name="description"]', 'Roasted urad dal papad');

    // Click submit in modal
    await adminPage.click('button[type="submit"]:has-text("Create Add-on")');

    // 4. Verify modal closes and "Special Papad" appears in catalog
    await expect(adminPage.locator('h2:has-text("Create New Add-on")')).not.toBeVisible({ timeout: 10000 });
    const papadHeading = adminPage.locator('h3:has-text("Special Papad")');
    await expect(papadHeading).toBeVisible({ timeout: 15000 });

    const papadCard = adminPage
      .locator('[data-testid^="addon-card-"]')
      .filter({ hasText: 'Special Papad' })
      .first();
    await expect(papadCard).toBeVisible({ timeout: 10000 });
    await expect(papadCard.locator('text=15')).toBeVisible();

    // 5. Edit "Special Papad" to ₹20
    const editBtn = papadCard.locator('button:has-text("Edit")').first();
    await editBtn.click();
    await expect(adminPage.locator('h2:has-text("Edit Add-on")')).toBeVisible({ timeout: 10000 });
    await adminPage.fill('input[name="price"]', '20');
    await adminPage.click('button[type="submit"]:has-text("Save Changes")');
    await expect(adminPage.locator('h2:has-text("Edit Add-on")')).not.toBeVisible({ timeout: 10000 });
    await expect(papadCard.locator('text=20')).toBeVisible({ timeout: 10000 });

    // 6. Navigate to /admin/customers and add the add-on to Customer's order
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    const customerRow = adminPage.locator('tbody tr', { hasText: 'Customer User' }).first();
    await expect(customerRow).toBeVisible({ timeout: 15000 });
    await customerRow.click();

    // Switch to Today's Meals tab
    const todayTab = adminPage.locator('button:has-text("Today\'s Meals")').first();
    await expect(todayTab).toBeVisible({ timeout: 10000 });
    await todayTab.click();

    // Click "+ Add Add-on"
    const addAddonBtn = adminPage.locator('button:has-text("+ Add Add-on")').first();
    await expect(addAddonBtn).toBeVisible({ timeout: 10000 });
    await addAddonBtn.click();

    // In modal, select "Special Papad"
    await expect(adminPage.locator('h3:has-text("Add Today\'s Add-on Item")')).toBeVisible({ timeout: 10000 });
    const papadOption = adminPage.locator('label', { hasText: 'Special Papad' }).first();
    await expect(papadOption).toBeVisible({ timeout: 10000 });
    await papadOption.click();

    // Submit add-on order
    await adminPage.click('button:has-text("Confirm Add Add-on")');
    await expect(adminPage.locator('h3:has-text("Add Today\'s Add-on Item")')).not.toBeVisible({ timeout: 15000 });

    // 7. Verify order snapshot contains Special Papad and frozen price ₹20
    await expect(adminPage.locator('text=Special Papad').first()).toBeVisible({ timeout: 15000 });
    await expect(adminPage.locator('text=₹20').first()).toBeVisible();

    // 8. Return to /admin/addons and change catalog price to ₹30
    await adminPage.goto('/admin/addons');
    await adminPage.waitForSelector('h1:has-text("Add-on Catalog")', { timeout: 20000 });

    const papadCardAgain = adminPage
      .locator('[data-testid^="addon-card-"]')
      .filter({ hasText: 'Special Papad' })
      .first();
    await papadCardAgain.locator('button:has-text("Edit")').first().click();
    await expect(adminPage.locator('h2:has-text("Edit Add-on")')).toBeVisible({ timeout: 10000 });
    await adminPage.fill('input[name="price"]', '30');
    await adminPage.click('button[type="submit"]:has-text("Save Changes")');
    await expect(adminPage.locator('h2:has-text("Edit Add-on")')).not.toBeVisible({ timeout: 10000 });
    await expect(papadCardAgain.locator('text=30')).toBeVisible({ timeout: 10000 });

    // 9. Return to Customer profile and verify the existing order still has frozen price ₹20
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });
    await adminPage.locator('tbody tr', { hasText: 'Customer User' }).first().click();
    await adminPage.locator('button:has-text("Today\'s Meals")').first().click();

    // Crucial check: existing order must still display original ₹20, NOT ₹30
    await expect(adminPage.locator('text=Special Papad').first()).toBeVisible({ timeout: 15000 });
    await expect(adminPage.locator('text=₹20').first()).toBeVisible();

    // 10. Disable the add-on in catalog
    await adminPage.goto('/admin/addons');
    await adminPage.waitForSelector('h1:has-text("Add-on Catalog")', { timeout: 20000 });

    const papadCardToDisable = adminPage
      .locator('[data-testid^="addon-card-"]')
      .filter({ hasText: 'Special Papad' })
      .first();
    const disableBtn = papadCardToDisable.locator('button:has-text("Disable")').first();
    await disableBtn.click();
    await expect(papadCardToDisable.locator('text=Inactive')).toBeVisible({ timeout: 10000 });

    // 11. Verify disabled add-on is rejected from new order selection
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });
    await adminPage.locator('tbody tr', { hasText: 'Customer User' }).first().click();
    await adminPage.locator('button:has-text("Today\'s Meals")').first().click();
    await adminPage.locator('button:has-text("+ Add Add-on")').first().click();
    await expect(adminPage.locator('h3:has-text("Add Today\'s Add-on Item")')).toBeVisible({ timeout: 10000 });

    // The modal must not display Special Papad
    const hasDisabledAddon = await adminPage.locator('label', { hasText: 'Special Papad' }).isVisible();
    expect(hasDisabledAddon).toBe(false);
  });
});
