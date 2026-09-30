import { Page, expect } from '@playwright/test';

export class CustomerPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoDashboard() {
    await this.page.goto('/dashboard');
  }

  async navigateToSubscriptions() {
    const subLink = this.page.locator('a[href="/customer/subscription"]').first();
    if (await subLink.isVisible()) {
      await subLink.click();
    } else {
      await this.page.goto('/customer/subscription');
    }
    await expect(this.page).toHaveURL(/\/customer\/subscription$/);
  }

  async verifyActiveSubscription() {
    await expect(this.page.locator('text=Active')).toBeVisible();
  }

  async pauseSubscription() {
    await this.page.click('button:has-text("Pause")');
    // Fill in dates if needed, then confirm
    await this.page.click('button:has-text("Confirm Pause")');
  }

  async resumeSubscription() {
    await this.page.click('button:has-text("Resume")');
    await this.page.click('button:has-text("Confirm Resume")');
  }
}
