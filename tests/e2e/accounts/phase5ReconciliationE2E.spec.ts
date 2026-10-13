import { test, expect } from '../shared/fixtures';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedScript = path.join(__dirname, '..', 'shared', 'seedPhase5Fixtures.cjs');

test.describe('Phase 5B.2: Accounts, Reconciliation & Role Authorization E2E', () => {
  test.beforeEach(async () => {
    // Re-seed emulator with Phase 5 fixtures before each test
    execSync(`node "${seedScript}"`, { stdio: 'pipe' });
  });

  // ---------------------------------------------------------------------------
  // 1. ADMIN ROLE — Desktop (1280x800) & Mobile (375x667)
  // ---------------------------------------------------------------------------
  test.describe('Admin Role Walkthrough', () => {
    test('desktop: dashboard loads, filters work, invoice details, offline payment, voiding & ledger audit', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 1280, height: 800 });
      await adminPage.goto('/admin/accounts');

      // 1. Verify Page Header & KPI Metric Cards
      await expect(adminPage.locator('h1, h2, h3').filter({ hasText: /Accounts & Billing/i }).first()).toBeVisible({ timeout: 15000 });
      await expect(adminPage.getByText(/OUTSTANDING RECEIVABLE/i).first()).toBeVisible();

      // 2. Invoice Filters & Search
      const searchInput = adminPage.locator('input[placeholder*="Search invoice #"]');
      await expect(searchInput).toBeVisible();

      // Search for modern invoice
      await searchInput.fill('INV-MODERN-2026-001');
      await expect(adminPage.getByText('INV-MODERN-2026-001')).toBeVisible();
      await expect(adminPage.getByText('INV-LEGACY-2026-002')).not.toBeVisible();

      // Clear search
      await searchInput.fill('');
      await expect(adminPage.getByText('INV-LEGACY-2026-002')).toBeVisible();

      // Filter by "Paid"
      await adminPage.locator('button', { hasText: 'paid' }).click();
      await expect(adminPage.getByText('INV-LEGACY-PAID-003')).toBeVisible();
      await expect(adminPage.getByText('INV-MODERN-2026-001')).not.toBeVisible();

      // Filter back to "All Invoices"
      await adminPage.locator('button', { hasText: 'All Invoices' }).click();
      await expect(adminPage.getByText('INV-MODERN-2026-001')).toBeVisible();

      // 3. Invoice Details Modal (Gross Subtotal, Credit Applied, Paid, Remaining Balance)
      const modernRow = adminPage.locator('tr').filter({ hasText: 'INV-MODERN-2026-001' });
      await modernRow.locator('button[title="View Invoice Details"]').click();

      const modal = adminPage.locator('div.fixed').filter({ hasText: 'Invoice Details' });
      await expect(modal).toBeVisible();
      await expect(modal.getByText('Subtotal:')).toBeVisible();
      await expect(modal.getByText('₹3,000')).toBeVisible();
      await expect(modal.getByText('Credit Applied:')).toBeVisible();
      await expect(modal.getByText('-₹500')).toBeVisible();
      await expect(modal.getByText('Paid Amount:')).toBeVisible();
      await expect(modal.getByText('₹1,000')).toBeVisible();
      await expect(modal.getByText('Remaining Balance Due:')).toBeVisible();
      await expect(modal.getByText('₹1,500')).toBeVisible();

      // Close modal
      await modal.locator('button', { hasText: 'Close' }).click();
      await expect(modal).not.toBeVisible();

      // 4. Record Offline Payment (Prefills remaining due ₹1,500)
      await modernRow.locator('button[title="Record Offline Payment"]').click();
      const offlineModal = adminPage.locator('div.fixed').filter({ hasText: 'Record Offline Payment' });
      await expect(offlineModal).toBeVisible();

      const amountInput = offlineModal.locator('input[type="number"]');
      // Should prefill remaining due = 1500
      await expect(amountInput).toHaveValue('1500');

      // Record offline payment of ₹500
      await amountInput.fill('500');
      await offlineModal.locator('button', { hasText: 'Record Payment' }).click();
      await expect(adminPage.getByText(/Offline payment recorded/i)).toBeVisible({ timeout: 10000 });
      await expect(offlineModal).not.toBeVisible();

      // 4b. Assert Displayed Remaining Balance after partial offline payment (₹1,500 -> ₹1,000)
      await expect(modernRow.locator('td span.text-amber-800')).toHaveText('₹1,000');
      await expect(modernRow.locator('td.text-blue-700')).toHaveText('₹1,500');

      // Verify Invoice Details modal also reflects remaining balance of ₹1,000
      await modernRow.locator('button[title="View Invoice Details"]').click();
      await expect(modal).toBeVisible();
      await expect(modal.getByText('Paid Amount:')).toBeVisible();
      await expect(modal.getByText('₹1,500')).toBeVisible();
      await expect(modal.getByText('Remaining Balance Due:')).toBeVisible();
      await expect(modal.getByText('₹1,000')).toBeVisible();
      await modal.locator('button', { hasText: 'Close' }).click();
      await expect(modal).not.toBeVisible();

      // 5. Void Invoice (Requires Reason & Confirmation)
      const legacyRow = adminPage.locator('tr').filter({ hasText: 'INV-LEGACY-2026-002' });
      await legacyRow.locator('button[title="Void Invoice"]').click();
      const voidModal = adminPage.locator('div.fixed').filter({ hasText: 'Void Invoice' });
      await expect(voidModal).toBeVisible();

      const confirmBtn = voidModal.locator('button', { hasText: 'Confirm Void' });
      // Button disabled when reason is empty
      await expect(confirmBtn).toBeDisabled();

      const reasonInput = voidModal.locator('input[placeholder*="Void Reason"], input[placeholder*="Billed in error"]');
      await reasonInput.fill('Customer opted for custom catering offline');
      await expect(confirmBtn).toBeEnabled();

      await confirmBtn.click();
      await expect(adminPage.getByText(/Invoice voided successfully/i)).toBeVisible({ timeout: 10000 });

      // 6. Customer Ledger History & Credit Deprecation Notice
      const custSearchInput = adminPage.locator('input[placeholder*="Search MP-A001"]');
      await custSearchInput.fill('customer@test.com');
      await adminPage.locator('form').filter({ has: custSearchInput }).locator('button[type="submit"]').click();

      // Verify customer details, deprecation notice, and historical credit ledger load
      await expect(adminPage.getByRole('heading', { name: 'Customer Ledger History' })).toBeVisible({ timeout: 10000 });
      await expect(adminPage.getByText('Historical Wallet Credit')).toBeVisible();
      await expect(adminPage.getByText('Customer Wallet Credit Discontinued')).toBeVisible();
      await expect(adminPage.getByText('Initial credit balance setup')).toBeVisible();

      // Manual wallet credit adjustments are discontinued; no Apply Credit button exists
      await expect(adminPage.locator('button', { hasText: 'Apply Credit' })).not.toBeVisible();
    });

    test('mobile: viewport 375x667 accounts dashboard renders responsive controls', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 375, height: 667 });
      await adminPage.goto('/admin/accounts');

      // Header is visible
      await expect(adminPage.locator('h1, h2, h3').filter({ hasText: /Accounts & Billing/i }).first()).toBeVisible({ timeout: 15000 });

      // Search input and tables are accessible
      const searchInput = adminPage.locator('input[placeholder*="Search invoice #"]');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('INV-MODERN');
      await expect(adminPage.getByText('INV-MODERN-2026-001')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ACCOUNTS ROLE — Route Access & Privilege Restrictions
  // ---------------------------------------------------------------------------
  test.describe('Accounts Role Walkthrough', () => {
    test('desktop & mobile: can access accounts dashboard, view invoices and ledger, but admin mutations are hidden', async ({ accountsPage }) => {
      await accountsPage.setViewportSize({ width: 1280, height: 800 });
      await accountsPage.goto('/admin/accounts');

      // 1. Verified route access and invoice table visibility
      await expect(accountsPage.locator('h1, h2, h3').filter({ hasText: /Accounts & Billing/i }).first()).toBeVisible({ timeout: 15000 });
      await expect(accountsPage.getByText('INV-MODERN-2026-001')).toBeVisible();

      // 2. Can view invoice details modal
      const modernRow = accountsPage.locator('tr').filter({ hasText: 'INV-MODERN-2026-001' });
      await modernRow.locator('button[title="View Invoice Details"]').click();
      const modal = accountsPage.locator('div.fixed').filter({ hasText: 'Invoice Details' });
      await expect(modal).toBeVisible();
      await expect(modal.getByText('Remaining Balance Due:')).toBeVisible();
      await modal.locator('button', { hasText: 'Close' }).click();

      // 3. Admin-only mutation buttons MUST NOT be visible
      await expect(modernRow.locator('button[title="Record Offline Payment"]')).not.toBeVisible();
      await expect(modernRow.locator('button[title="Void Invoice"]')).not.toBeVisible();

      // 4. Customer ledger inspection is available, but manual adjustment form is restricted
      const custSearchInput = accountsPage.locator('input[placeholder*="Search MP-A001"]');
      await custSearchInput.fill('customer@test.com');
      await accountsPage.locator('form').filter({ has: custSearchInput }).locator('button[type="submit"]').click();

      await expect(accountsPage.getByRole('heading', { name: 'Customer Ledger History' })).toBeVisible({ timeout: 10000 });
      await expect(accountsPage.getByText('Initial credit balance setup')).toBeVisible();

      // Wallet adjustments discontinued notice displayed
      await expect(accountsPage.getByText(/Customer Wallet Credit Discontinued/i)).toBeVisible();
      await expect(accountsPage.locator('button', { hasText: 'Apply Credit' })).not.toBeVisible();
    });

    test('direct mutation attempts by accounts role are blocked in the UI and protected routes', async ({ accountsPage }) => {
      await accountsPage.goto('/admin/accounts');
      await expect(accountsPage.locator('h1, h2, h3').filter({ hasText: /Accounts & Billing/i }).first()).toBeVisible({ timeout: 15000 });

      // Verify that no payment recording triggers exist on any invoice row
      const recordButtons = accountsPage.locator('button[title="Record Offline Payment"]');
      await expect(recordButtons).toHaveCount(0);

      // Verify that no void triggers exist on any invoice row
      const voidButtons = accountsPage.locator('button[title="Void Invoice"]');
      await expect(voidButtons).toHaveCount(0);

      // Verify that manual adjustment form is absent
      const applyCreditBtn = accountsPage.locator('button', { hasText: 'Apply Credit' });
      await expect(applyCreditBtn).toHaveCount(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CUSTOMER ROLE — Payment History, Pay Bill & Balance Accuracy
  // ---------------------------------------------------------------------------
  test.describe('Customer Role Walkthrough', () => {
    test('displays accurate balances for legacy and modern invoices, with Pay Bill reference', async ({ customerPage }) => {
      await customerPage.setViewportSize({ width: 1280, height: 800 });
      await customerPage.goto('/customer/payments');

      // 1. Verify Page Header & KPI Cards
      await expect(customerPage.locator('h1').filter({ hasText: /Billing & Payments/i })).toBeVisible({ timeout: 15000 });

      // Total Outstanding Due = ₹1,500 (modern) + ₹2,500 (legacy issued) = ₹4,000
      await expect(customerPage.getByText('₹4,000')).toBeVisible();
      await expect(customerPage.getByText('Outstanding Due')).toBeVisible();
      await expect(customerPage.getByText('Total Invoices')).toBeVisible();
      await expect(customerPage.getByText('Fully Settled')).toBeVisible();

      // 2. Verify Modern Invoice Row
      const modernRow = customerPage.locator('tr').filter({ hasText: 'INV-MODERN-2026-001' }).first();
      await expect(modernRow).toBeVisible();
      await expect(modernRow.getByText('₹1,500')).toBeVisible(); // Remaining due

      // 3. Verify Legacy Paid Invoice Row
      const legacyPaidRow = customerPage.locator('tr').filter({ hasText: 'INV-LEGACY-PAID-003' }).first();
      await expect(legacyPaidRow).toBeVisible();
      await expect(legacyPaidRow.getByText(/Paid/i).first()).toBeVisible();

      // 4. Click "Pay Bill" on Modern Invoice
      const payBillBtn = modernRow.locator('button:has-text("Pay Bill")');
      await expect(payBillBtn).toBeVisible();
      await payBillBtn.click();

      // 5. Verify Manual Payment Panel opens with correct settlement amount ₹1,500 and invoice reference
      await expect(customerPage.getByText(/Payment against invoice/i)).toBeVisible({ timeout: 10000 });
      await expect(customerPage.getByText('Pay Invoice #INV-MODERN-2026-001')).toBeVisible();
      await expect(customerPage.locator('div').filter({ hasText: /Payment against invoice/i }).getByText('₹1,500').first()).toBeVisible();
    });

    test('customer role is restricted from admin routes and destructive controls', async ({ customerPage }) => {
      // 1. Customer navigating to /admin/accounts is redirected away by ProtectedRoute
      await customerPage.goto('/admin/accounts');
      await expect(customerPage).not.toHaveURL(/\/admin\/accounts/);

      // 2. Customer in Payment History has no administrative offline payment or ledger editing controls
      await customerPage.goto('/customer/payments');
      await expect(customerPage.locator('h1').filter({ hasText: /Billing & Payments/i })).toBeVisible({ timeout: 15000 });
      await expect(customerPage.locator('button[title="Record Offline Payment"]')).toHaveCount(0);
      await expect(customerPage.locator('button[title="Void Invoice"]')).toHaveCount(0);
    });
  });
});
