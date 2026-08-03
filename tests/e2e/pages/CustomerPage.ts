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
    // Navigate directly — the nav link href is /customer/subscription (no trailing 's')
    await this.page.goto('/customer/subscription');
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
