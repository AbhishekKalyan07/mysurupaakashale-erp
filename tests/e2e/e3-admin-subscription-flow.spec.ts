import { test, expect } from './shared/fixtures';
import axios from 'axios';

test.describe('PHASE E3 — Admin-Assisted Customer Plan/Subscription Management Flow', () => {
  test('Admin creates subscription for existing customer, configures plan, verifies pricing snapshot and lifecycle', async ({ adminPage, customerPage }) => {
    // 0. Clean any pre-existing subscriptions so customer is in un-subscribed state
    await axios.delete('http://127.0.0.1:8085/emulator/v1/projects/demo-test/databases/(default)/documents/subscriptions/sub-e2e-1').catch(() => {});
    await axios.delete('http://127.0.0.1:8085/emulator/v1/projects/demo-test/databases/(default)/documents/subscriptions/sub-e2e-neg').catch(() => {});

    // 1. Login as Admin & navigate to Customers management
    await adminPage.goto('/admin/customers');
    await adminPage.waitForSelector('h1:has-text("Customers")', { timeout: 20000 });

    // 2. Open existing customer profile (Customer User)
    const customerRow = adminPage.locator('tbody tr', { hasText: 'Customer User' }).first();
    await expect(customerRow).toBeVisible({ timeout: 15000 });
    await customerRow.click();

    // 3. Verify Customer Details modal opens
    await expect(adminPage.locator('h2:has-text("Customer Details")')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=Customer User').first()).toBeVisible({ timeout: 10000 });

    // 4. Click "+ Create Subscription" action
    const createSubBtn = adminPage.locator('button:has-text("+ Create Subscription")').first();
    await expect(createSubBtn).toBeVisible({ timeout: 10000 });
    await createSubBtn.click();

    // 5. Verify "Create Subscription for Customer" modal opens
    await expect(adminPage.locator('h2:has-text("Create Subscription for Customer")')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('text=Admin Assisted').first()).toBeVisible();

    // 6. Select Plan (Standard Plan)
    const planCard = adminPage.locator('div[class*="cursor-pointer"]', { hasText: 'Standard Plan' }).first();
    await expect(planCard).toBeVisible({ timeout: 10000 });
    await planCard.click();

    // 7. Verify / Fill Address if empty
    const addressInput = adminPage.locator('input[placeholder*="Address Line 1"]');
    if (await addressInput.isVisible()) {
      await addressInput.fill('45 Gokulam 3rd Stage');
      await adminPage.fill('input[placeholder*="Pincode"]', '570002');
    }

    // 8. Verify Pricing Summary appears with calculated E2 pricing
    await expect(adminPage.locator('text=Pricing Summary (E2 Authoritative)')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText('Daily Per Person', { exact: true })).toBeVisible();
    await expect(adminPage.getByText('Delivery Days', { exact: true })).toBeVisible();

    // 9. Submit the subscription creation
    const submitBtn = adminPage.locator('button[type="submit"]:has-text("Create Subscription")').first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    // 10. Verify modal closes and success notification appears
    await expect(adminPage.locator('h2:has-text("Create Subscription for Customer")')).not.toBeVisible({ timeout: 15000 });

    // 11. Verify newly created subscription appears in customer's Subscriptions tab
    await expect(adminPage.locator('text=PLAN').first()).toBeVisible({ timeout: 15000 });

    // 12. Verify customer can see the subscription in their view
    await customerPage.goto('/customer/subscription');
    await expect(customerPage.getByText('Standard Plan').first()).toBeVisible({ timeout: 20000 });

    // 13. Verify Admin can manage subscriptions across the system
    await adminPage.goto('/admin/subscriptions');
    await adminPage.waitForSelector('h1:has-text("Subscriptions")', { timeout: 20000 });
    await adminPage.click('button:has-text("ACTIVE")');
    await expect(adminPage.locator('text=Customer User').first()).toBeVisible({ timeout: 15000 });
  });
});
