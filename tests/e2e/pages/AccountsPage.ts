import { Page, expect } from '@playwright/test';

export class AccountsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoDashboard() {
    await this.page.goto('/accounts');
  }

  async verifyDashboardLoaded() {
    await expect(this.page.locator('h1', { hasText: 'Accounts Dashboard' })).toBeVisible();
  }

  async navigateToInvoices() {
    await this.page.click('a[href="/accounts/invoices"]');
  }

  async verifyInvoiceGeneration() {
    await expect(this.page.locator('text=Total Pending')).toBeVisible();
  }

  async recordPayment(invoiceId: string) {
    const row = this.page.locator(`[data-testid="invoice-${invoiceId}"]`);
    await row.locator('button:has-text("Record Payment")').click();
    await this.page.fill('input[name="amount"]', '4500');
    await this.page.click('button:has-text("Submit Payment")');
  }
}
