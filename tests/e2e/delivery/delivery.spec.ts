import { test, expect } from '../shared/fixtures';
import { DeliveryPage } from '../pages/DeliveryPage';

test.describe('Delivery Journey', () => {
  test('driver can view delivery dashboard', async ({ deliveryPage }) => {
    const page = new DeliveryPage(deliveryPage);
    await page.gotoDashboard();
    await page.verifyDashboardLoaded();
  });

  test('driver can pickup and deliver an order', async ({ deliveryPage }) => {
    const page = new DeliveryPage(deliveryPage);
    await page.gotoMyRoute();
    await page.verifyMyRouteLoaded();
    
    // Find an order card with a "Confirm Pickup" button
    const pickupBtn = deliveryPage.locator('button', { hasText: /Confirm Pickup|Mark as Picked Up/i }).first();
    if (await pickupBtn.isVisible()) {
      await pickupBtn.click();
      await expect(deliveryPage.locator('text=Picked Up').first()).toBeVisible();
      
      const outBtn = deliveryPage.locator('button', { hasText: 'Start Delivery' }).first();
      if (await outBtn.isVisible()) {
        await outBtn.click();
        await expect(deliveryPage.locator('text=Out for Delivery').first()).toBeVisible();
        
        const deliverBtn = deliveryPage.locator('button', { hasText: 'Mark as Delivered' }).first();
        if (await deliverBtn.isVisible()) {
          await deliverBtn.click();
          await expect(deliveryPage.locator('text=Delivered').first()).toBeVisible();
        }
      }
    }
  });
});
