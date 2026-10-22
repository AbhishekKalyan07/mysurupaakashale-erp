import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Phase 7B — Accessibility & Focus Trapping Hardening", () => {
  describe("AdminAccountsPage Accessibility", () => {
    const filePath = resolve(process.cwd(), "src/features/admin/pages/AdminAccountsPage.tsx");
    const content = readFileSync(filePath, "utf-8");

    it("has accessible names for table icon action buttons", () => {
      expect(content).toContain('aria-label="View Invoice Details"');
      expect(content).toContain('aria-label="Record Offline Payment"');
      expect(content).toContain('aria-label="Void Invoice"');
      expect(content).toContain('aria-label="Close invoice details"');
    });

    it("has dialog role, aria-modal, and dynamic title associations for all 3 modals", () => {
      // Invoice Details
      expect(content).toContain('aria-labelledby={viewInvoiceTitleId}');
      expect(content).toContain('id={viewInvoiceTitleId}');

      // Void Confirmation
      expect(content).toContain('aria-labelledby={voidInvoiceTitleId}');
      expect(content).toContain('id={voidInvoiceTitleId}');

      // Record Offline Payment
      expect(content).toContain('aria-labelledby={offlinePaymentTitleId}');
      expect(content).toContain('id={offlinePaymentTitleId}');
    });

    it("uses focus trap and scroll lock on all modals", () => {
      expect(content).toContain("useFocusTrap(viewInvoiceRef, Boolean(viewInvoice))");
      expect(content).toContain("useFocusTrap(voidInvoiceRef, Boolean(voidInvoiceTarget))");
      expect(content).toContain("useFocusTrap(offlinePaymentRef, Boolean(offlinePaymentTarget))");
      expect(content).toContain("useScrollLock(Boolean(viewInvoice || voidInvoiceTarget || offlinePaymentTarget))");
    });
  });

  describe("Customer Modals Accessibility", () => {
    it("ResumeDeliveryModal has dialog semantics, scroll lock, focus trap, and safe-area padding", () => {
      const p = resolve(process.cwd(), "src/features/customer/components/ResumeDeliveryModal.tsx");
      const c = readFileSync(p, "utf-8");
      expect(c).toContain('role="dialog"');
      expect(c).toContain('aria-modal="true"');
      expect(c).toContain("aria-labelledby={titleId}");
      expect(c).toContain("useScrollLock(true)");
      expect(c).toContain("useFocusTrap(cardRef, true)");
      expect(c).toContain("pb-safe");
    });

    it("ChangeTodayMealModal has dialog semantics, scroll lock, focus trap, and safe-area padding", () => {
      const p = resolve(process.cwd(), "src/features/customer/components/ChangeTodayMealModal.tsx");
      const c = readFileSync(p, "utf-8");
      expect(c).toContain('role="dialog"');
      expect(c).toContain('aria-modal="true"');
      expect(c).toContain("aria-labelledby={titleId}");
      expect(c).toContain("useScrollLock(true)");
      expect(c).toContain("useFocusTrap(modalRef, true)");
      expect(c).toContain("pb-safe");
    });

    it("CancelTodayModal has dialog semantics, scroll lock, focus trap, and safe-area padding", () => {
      const p = resolve(process.cwd(), "src/features/customer/components/CancelTodayModal.tsx");
      const c = readFileSync(p, "utf-8");
      expect(c).toContain('role="dialog"');
      expect(c).toContain('aria-modal="true"');
      expect(c).toContain("aria-labelledby={titleId}");
      expect(c).toContain("useScrollLock(true)");
      expect(c).toContain("useFocusTrap(modalRef, true)");
      expect(c).toContain("pb-safe");
    });
  });

  describe("Business Settings Mobile Safe-Area Spacing", () => {
    it("floating save bar applies pb-safe for iOS home indicator avoidance", () => {
      const p = resolve(process.cwd(), "src/features/admin/pages/BusinessSettingsPage.tsx");
      const c = readFileSync(p, "utf-8");
      expect(c).toContain("pb-safe");
    });
  });
});
