import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { renderToString } from "react-dom/server";
import { MetricCard } from "@/shared/components/ui/MetricCard";
import { lockScroll, unlockScroll, _resetScrollLock } from "@/shared/hooks/useScrollLock";
import { Users } from "lucide-react";

describe("Phase 3B UI/UX Completion Tests", () => {
  describe("1. Background Scroll Lock Integration", () => {
    it("useScrollLock helper correctly locks and unlocks document.body", () => {
      _resetScrollLock();
      expect(document.body.style.overflow).toBe("");

      lockScroll();
      expect(document.body.style.overflow).toBe("hidden");

      // Nested lock keeps overflow hidden
      lockScroll();
      expect(document.body.style.overflow).toBe("hidden");

      unlockScroll();
      expect(document.body.style.overflow).toBe("hidden");

      unlockScroll();
      expect(document.body.style.overflow).toBe("");
    });

    it("all core modal and dialog files import and utilize useScrollLock", () => {
      const modalFiles = [
        "src/shared/components/ui/PremiumModal.tsx",
        "src/shared/components/ui/ConfirmDeleteDialog.tsx",
        "src/shared/components/ui/UnsavedChangesDialog.tsx",
        "src/features/admin/pages/AdminOrdersPage.tsx",
        "src/features/admin/pages/AdminCustomersPage.tsx",
        "src/features/admin/components/AdminCreateSubscriptionModal.tsx",
        "src/features/admin/components/ChangePlanModal.tsx",
        "src/features/admin/components/AddMealForDateModal.tsx",
      ];

      for (const relPath of modalFiles) {
        const fullPath = resolve(process.cwd(), relPath);
        const content = readFileSync(fullPath, "utf-8");
        expect(content, `${relPath} must import useScrollLock`).toContain("useScrollLock");
      }
    });
  });

  describe("2. Permanent Meal-Type Filter on AdminOrdersPage", () => {
    it("AdminOrdersPage renders meal type filter pills permanently", () => {
      const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminOrdersPage.tsx");
      const content = readFileSync(pagePath, "utf-8");

      // Permanent filter bar exists without needing to click "Filters"
      expect(content).toContain("Permanent Meal Type Filter");
      expect(content).toContain("setMealTypeFilter");
      expect(content).toContain('"all"');
      expect(content).toContain('"breakfast"');
      expect(content).toContain('"lunch"');
      expect(content).toContain('"dinner"');
      expect(content).toContain('"All Meals"');
      expect(content).toContain('"Breakfast"');
      expect(content).toContain('"Lunch"');
      expect(content).toContain('"Dinner"');

      // Collapsible showFilters state is not used to hide meal type filters
      expect(content).not.toContain("setShowFilters(!showFilters)");
    });
  });

  describe("3. Admin Dashboard Metric Cards Navigation & Accessibility", () => {
    it("MetricCard provides button role, tabIndex, and keyboard accessibility when onClick is provided", () => {
      const handleClick = vi.fn();
      const html = renderToString(
        <MetricCard
          title="Total Customers"
          value={42}
          icon={<Users size={24} />}
          onClick={handleClick}
        />,
      );

      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('Total Customers');
      expect(html).toContain('42');
    });

    it("AdminDashboardPage routes all metric cards to target management pages", () => {
      const pagePath = resolve(process.cwd(), "src/features/dashboard/pages/AdminDashboardPage.tsx");
      const content = readFileSync(pagePath, "utf-8");

      expect(content).toContain('navigate("/admin/customers")');
      expect(content).toContain('navigate("/admin/zones")');
      expect(content).toContain('navigate("/admin/subscriptions")');
      expect(content).toContain('navigate("/admin/accounts")');
      expect(content).toContain('navigate("/admin/orders")');
      expect(content).toContain('navigate("/admin/kitchen")');
      expect(content).toContain('navigate("/admin/delivery")');
      expect(content).toContain('navigate("/admin/complaints")');
      expect(content).toContain('navigate("/admin/audit")');
    });
  });

  describe("4. Customer Details UI Enhancements & Activity Section", () => {
    it("AdminCustomersPage includes New Activity tab and CustomerActivityView grouped by Today, Yesterday, Earlier", () => {
      const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
      const content = readFileSync(pagePath, "utf-8");

      expect(content).toContain('"New Activity"');
      expect(content).toContain('CustomerActivityView');
      expect(content).toContain('"Today"');
      expect(content).toContain('"Yesterday"');
      expect(content).toContain('"Earlier"');
    });

    it("Customer order history renders add-on badges, human-readable display IDs, and tabular pricing", () => {
      const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
      const content = readFileSync(pagePath, "utf-8");

      // Add-on badge
      expect(content).toContain("✨ Add-on:");
      expect(content).toContain("order.addonName");
      expect(content).toContain("order.addonQuantity");

      // Human-readable display ID
      expect(content).toContain("order.displayId");

      // Tabular numbers typography
      expect(content).toContain("tabular-nums");
    });
  });
});
