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
    await page.gotoDashboard();
    
    // Find an order card with a "Pick Up" button
    const pickupBtn = deliveryPage.locator('button:has-text("Pick Up")').first();
    if (await pickupBtn.isVisible()) {
      await pickupBtn.click();
      await expect(deliveryPage.locator('text=Out for Delivery').first()).toBeVisible();
      
      const deliverBtn = deliveryPage.locator('button:has-text("Mark Delivered")').first();
      if (await deliverBtn.isVisible()) {
        await deliverBtn.click();
        await expect(deliveryPage.locator('text=Delivered').first()).toBeVisible();
      }
    }
  });
});
