import { Page, expect } from '@playwright/test';

export class AdminPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoDashboard() {
    await this.page.goto('/dashboard');
  }

  async verifyDashboardKPIs() {
    await expect(this.page.locator('h1', { hasText: 'Admin' })).toBeVisible();
    await expect(this.page.locator('text=Total Customers')).toBeVisible();
    await expect(this.page.locator('text=Total Orders')).toBeVisible();
  }

  async navigateToCustomers() {
    await this.page.click('a[href="/admin/customers"]');
  }

  async createCustomer(name: string, email: string) {
    await this.navigateToCustomers();
    await this.page.click('button:has-text("Add Customer")');
    await this.page.fill('input[name="name"]', name);
    await this.page.fill('input[name="email"]', email);
    await this.page.click('button:has-text("Save")');
  }
}
