import { Page, expect } from '@playwright/test';

export class DeliveryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoDashboard() {
    await this.page.goto('/delivery');
  }

  async verifyDashboardLoaded() {
    await expect(this.page.locator('h1', { hasText: 'Delivery Partner Dashboard' })).toBeVisible();
  }

  async pickupOrder(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button:has-text("Pick Up")').click();
  }

  async markOutForDelivery(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button:has-text("Out for Delivery")').click();
  }

  async completeDelivery(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button:has-text("Mark Delivered")').click();
  }
}
