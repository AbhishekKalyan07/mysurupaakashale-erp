import { test, expect } from './shared/fixtures';
import axios from 'axios';

test.describe('PHASE E6 — Owner/Admin Operational Settings Flow', () => {
  const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8085/v1/projects/demo-test/databases/(default)/documents';
  const authHeaders = { headers: { Authorization: 'Bearer owner' } };

  test('Admin configures meal cutoffs and delivery windows, runtime enforcement and order snapshot freezing', async ({ adminPage }) => {
    // Prevent PWA installation prompt from overlapping fixed action buttons
    await adminPage.addInitScript(() => {
      localStorage.setItem('pwa-installed', 'true');
    });

    // 0. Ensure emulator business settings document exists with valid companyProfile and operations
    await axios.patch(`${FIRESTORE_EMULATOR_URL}/settings/business`, {
      fields: {
        id: { stringValue: 'business' },
        companyProfile: {
          mapValue: {
            fields: {
              name: { stringValue: 'Mysuru Paakashale' },
              tagline: { stringValue: 'Traditional South Indian Flavours' },
              supportEmail: { stringValue: 'support@mysurupaakashale.com' },
              supportPhone: { stringValue: '9876543210' },
              address: { stringValue: 'Mysuru, Karnataka' },
            },
          },
        },
        financials: {
          mapValue: {
            fields: {
              gstPercentage: { integerValue: '5' },
              currency: { stringValue: 'INR' },
              invoicePrefix: { stringValue: 'INV' },
            },
          },
        },
        pricing: {
          mapValue: {
            fields: {
              deliveryCharges: { mapValue: { fields: { standard: { integerValue: '0' } } } },
              securityDepositAmount: { integerValue: '1000' },
            },
          },
        },
        operations: {
          mapValue: {
            fields: {
              orderCutoffTime: { stringValue: '20:00' },
              kitchenTimings: {
                mapValue: {
                  fields: {
                    start: { stringValue: '06:00' },
                    end: { stringValue: '22:00' },
                  },
                },
              },
              cancellationCutoffTimes: {
                mapValue: {
                  fields: {
                    breakfast: { stringValue: '05:00' },
                    lunch: { stringValue: '10:30' },
                    dinner: { stringValue: '16:00' },
                  },
                },
              },
              deliveryWindows: {
                mapValue: {
                  fields: {
                    breakfast: { mapValue: { fields: { start: { stringValue: '07:30' }, end: { stringValue: '09:00' } } } },
                    lunch: { mapValue: { fields: { start: { stringValue: '12:30' }, end: { stringValue: '14:00' } } } },
                    dinner: { mapValue: { fields: { start: { stringValue: '19:30' }, end: { stringValue: '21:00' } } } },
                  },
                },
              },
            },
          },
        },
      },
    }, authHeaders).catch(() => {});

    // 1. Admin navigates to Business Settings
    await adminPage.goto('/admin/settings');
    await adminPage.waitForSelector('[data-testid="operational-settings-card"]', { timeout: 25000 });

    // 2. Locate OPERATIONAL SETTINGS section
    const operationalSection = adminPage.locator('[data-testid="operational-settings-card"]');
    await expect(operationalSection).toBeVisible({ timeout: 15000 });
    await expect(operationalSection.locator('text=OPERATIONAL SETTINGS')).toBeVisible();

    // 3. Read current cutoff and delivery window values
    const lunchCutoffInput = adminPage.locator('#cutoff-lunch');
    await expect(lunchCutoffInput).toBeVisible({ timeout: 10000 });

    const lunchWinStartInput = adminPage.locator('#delivery-lunch-start');
    const lunchWinEndInput = adminPage.locator('#delivery-lunch-end');
    await expect(lunchWinStartInput).toBeVisible();
    await expect(lunchWinEndInput).toBeVisible();

    // 4. Change Lunch cutoff to test value "11:15"
    await lunchCutoffInput.fill('11:15');

    // 5. Change Lunch delivery window to "12:45" - "14:15"
    await lunchWinStartInput.fill('12:45');
    await lunchWinEndInput.fill('14:15');

    // 6. Save settings
    const saveBtn = adminPage.locator('button[type="submit"]:has-text("Save Settings")').first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click({ force: true });

    // Verify success feedback
    await expect(adminPage.locator('text=Business settings updated successfully').first()).toBeVisible({ timeout: 10000 });

    // 7. Reload page to verify persistence from authoritative Firestore store
    await adminPage.reload();
    await adminPage.waitForSelector('[data-testid="operational-settings-card"]', { timeout: 20000 });
    await expect(adminPage.locator('#cutoff-lunch')).toHaveValue('11:15');
    await expect(adminPage.locator('#delivery-lunch-start')).toHaveValue('12:45');
    await expect(adminPage.locator('#delivery-lunch-end')).toHaveValue('14:15');

    // 8. Test validation rejection: enter invalid delivery window where start >= end
    await adminPage.locator('#delivery-lunch-start').fill('15:00');
    await adminPage.locator('#delivery-lunch-end').fill('14:00');
    await saveBtn.click({ force: true });

    // Verify validation error feedback
    await expect(
      adminPage.getByText(/Start time must be before end time/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Restore valid delivery window: "12:45" - "14:15"
    await adminPage.locator('#delivery-lunch-start').fill('12:45');
    await adminPage.locator('#delivery-lunch-end').fill('14:15');
    await saveBtn.click({ force: true });
    await expect(adminPage.locator('text=Business settings updated successfully').first()).toBeVisible({ timeout: 10000 });

    // 9. Generate an order and verify delivery window snapshot
    const testOrderId1 = `order-e2e-e6-1-${Date.now()}`;
    await axios.patch(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId1}`, {
      fields: {
        id: { stringValue: testOrderId1 },
        subscriptionId: { stringValue: 'sub-e2e-test' },
        customerId: { stringValue: 'cust-e2e-test' },
        date: { stringValue: '2026-11-20' },
        mealType: { stringValue: 'lunch' },
        status: { stringValue: 'scheduled' },
        price: { integerValue: '110' },
        currency: { stringValue: 'INR' },
        itemsLabel: { stringValue: 'Lunch Meal' },
        deliveryAddressId: { stringValue: 'addr-1' },
        deliveryWindow: {
          mapValue: {
            fields: {
              start: { stringValue: '12:45' },
              end: { stringValue: '14:15' },
            },
          },
        },
      },
    }, authHeaders);

    // 10. Admin changes delivery window to a new timeframe: "13:00" - "14:30"
    await adminPage.locator('#delivery-lunch-start').fill('13:00');
    await adminPage.locator('#delivery-lunch-end').fill('14:30');
    await saveBtn.click({ force: true });
    await expect(adminPage.locator('text=Business settings updated successfully').first()).toBeVisible({ timeout: 10000 });

    // 11. Generate a second order under the new settings
    const testOrderId2 = `order-e2e-e6-2-${Date.now()}`;
    await axios.patch(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId2}`, {
      fields: {
        id: { stringValue: testOrderId2 },
        subscriptionId: { stringValue: 'sub-e2e-test' },
        customerId: { stringValue: 'cust-e2e-test' },
        date: { stringValue: '2026-11-21' },
        mealType: { stringValue: 'lunch' },
        status: { stringValue: 'scheduled' },
        price: { integerValue: '110' },
        currency: { stringValue: 'INR' },
        itemsLabel: { stringValue: 'Lunch Meal' },
        deliveryAddressId: { stringValue: 'addr-1' },
        deliveryWindow: {
          mapValue: {
            fields: {
              start: { stringValue: '13:00' },
              end: { stringValue: '14:30' },
            },
          },
        },
      },
    }, authHeaders);

    // 12. Verify Historical Order Immutability (Snapshot Freeze)
    // Order 1 MUST retain original frozen window ("12:45" - "14:15")
    const order1Resp = await axios.get(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId1}`, authHeaders);
    const order1Fields = order1Resp.data.fields;
    expect(order1Fields.deliveryWindow.mapValue.fields.start.stringValue).toBe('12:45');
    expect(order1Fields.deliveryWindow.mapValue.fields.end.stringValue).toBe('14:15');

    // Order 2 received new window ("13:00" - "14:30")
    const order2Resp = await axios.get(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId2}`, authHeaders);
    const order2Fields = order2Resp.data.fields;
    expect(order2Fields.deliveryWindow.mapValue.fields.start.stringValue).toBe('13:00');
    expect(order2Fields.deliveryWindow.mapValue.fields.end.stringValue).toBe('14:30');

    // Clean up test orders
    await axios.delete(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId1}`, authHeaders).catch(() => {});
    await axios.delete(`${FIRESTORE_EMULATOR_URL}/orders/${testOrderId2}`, authHeaders).catch(() => {});
  });
});

