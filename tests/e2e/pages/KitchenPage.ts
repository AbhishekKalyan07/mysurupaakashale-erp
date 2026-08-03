import { Page, expect } from '@playwright/test';

export class KitchenPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoProductionBoard() {
    await this.page.goto('/kitchen/production');
  }

  async verifyBoardLoaded() {
    await expect(this.page.locator('h1', { hasText: 'Kitchen Dashboard' })).toBeVisible();
  }

  async updateOrderStatusToPreparing(orderId: string) {
    // Note: Assuming rows have data-testid=`order-${orderId}`
    const row = this.page.locator(`[data-testid="order-${orderId}"]`);
    await row.locator('button:has-text("Start Prep")').click();
  }

  async updateOrderStatusToReady(orderId: string) {
    const row = this.page.locator(`[data-testid="order-${orderId}"]`);
    await row.locator('button:has-text("Mark Ready")').click();
  }

  async lockProduction() {
    await this.page.click('button:has-text("Lock Production")');
    await expect(this.page.locator('text=Production Locked')).toBeVisible();
  }

  async printPackingSheet() {
    // We can intercept window.print in the test
    await this.page.evaluate(() => {
      window.print = function() {
        (window as any).printCalled = true;
      };
    });
    await this.page.click('button:has-text("Print Packing Sheet")');
    
    // Assert print was called
    const printCalled = await this.page.evaluate(() => (window as any).printCalled);
    expect(printCalled).toBe(true);
  }
}
