import { Page, expect } from '@playwright/test';

export class DeliveryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    // Auto-accept all confirmation dialogs (like "Confirm Pickup?" or "Mark order as Delivered?")
    this.page.on('dialog', async dialog => {
      await dialog.accept();
    });
  }

  async gotoDashboard() {
    await this.page.goto('/dashboard');
  }

  async verifyDashboardLoaded() {
    await expect(this.page.locator('h1', { hasText: 'My Delivery Route' })).toBeVisible();
  }

  async pickupOrder(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button', { hasText: /Confirm Pickup|Mark as Picked Up/i }).click();
  }

  async markOutForDelivery(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button', { hasText: 'Start Delivery' }).click();
  }

  async completeDelivery(orderId: string) {
    const card = this.page.locator(`[data-testid="order-${orderId}"]`);
    await card.locator('button', { hasText: 'Mark as Delivered' }).click();
  }
}
