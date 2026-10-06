import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { PremiumSidebar } from "../PremiumSidebar";
import { Sidebar } from "../Sidebar";
import { ROLES } from "@/shared/constants/roles";

vi.mock("@/shared/hooks/usePWAInstall", () => ({
  usePWAInstall: () => ({
    isInstallable: false,
    isInstalled: true,
    triggerInstall: vi.fn(),
  }),
}));

describe("Admin Navigation Active State Matching", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
    vi.clearAllMocks();
  });

  const renderPremiumSidebar = async (initialPath: string) => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <PremiumSidebar role={ROLES.ADMIN} isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });
  };

  const renderClassicSidebar = async (initialPath: string) => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <Sidebar role={ROLES.ADMIN} isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });
  };

  describe("PremiumSidebar route matching", () => {
    it("highlights Payment Verification and NOT Customers on /admin/payment-verification", async () => {
      await renderPremiumSidebar("/admin/payment-verification");

      const links = Array.from(container!.querySelectorAll("a"));
      const paymentLink = links.find((a) =>
        a.textContent?.includes("Payment Verification"),
      );
      const customerLink = links.find((a) =>
        a.textContent?.includes("Customers"),
      );

      expect(paymentLink).toBeTruthy();
      expect(customerLink).toBeTruthy();

      // Payment Verification must be highlighted
      expect(paymentLink!.className).toContain("bg-primary/10");
      expect(paymentLink!.className).toContain("text-primary");

      // Customers must NOT be highlighted
      expect(customerLink!.className).not.toContain("bg-primary/10 text-primary");
      expect(customerLink!.className).toContain("text-primary/60");
    });

    it("highlights Payment Verification and NOT Customers on legacy alias /admin/payments", async () => {
      await renderPremiumSidebar("/admin/payments");

      const links = Array.from(container!.querySelectorAll("a"));
      const paymentLink = links.find((a) =>
        a.textContent?.includes("Payment Verification"),
      );
      const customerLink = links.find((a) =>
        a.textContent?.includes("Customers"),
      );

      expect(paymentLink).toBeTruthy();
      expect(customerLink).toBeTruthy();

      // Payment Verification must be highlighted
      expect(paymentLink!.className).toContain("bg-primary/10");
      expect(paymentLink!.className).toContain("text-primary");

      // Customers must NOT be highlighted
      expect(customerLink!.className).not.toContain("bg-primary/10 text-primary");
    });

    it("highlights Customers and NOT Payment Verification on /admin/customers", async () => {
      await renderPremiumSidebar("/admin/customers");

      const links = Array.from(container!.querySelectorAll("a"));
      const paymentLink = links.find((a) =>
        a.textContent?.includes("Payment Verification"),
      );
      const customerLink = links.find((a) =>
        a.textContent?.includes("Customers"),
      );

      expect(customerLink!.className).toContain("bg-primary/10");
      expect(paymentLink!.className).not.toContain("bg-primary/10 text-primary");
    });

    it("highlights Settings on both /admin/settings and /admin/business-settings", async () => {
      await renderPremiumSidebar("/admin/business-settings");

      const links = Array.from(container!.querySelectorAll("a"));
      const settingsLink = links.find((a) =>
        a.textContent?.includes("Settings"),
      );

      expect(settingsLink).toBeTruthy();
      expect(settingsLink!.className).toContain("bg-primary/10");
    });
  });

  describe("Sidebar (classic) route matching", () => {
    it("highlights Payment Verification and NOT Customers on /admin/payment-verification", async () => {
      await renderClassicSidebar("/admin/payment-verification");

      const links = Array.from(container!.querySelectorAll("a"));
      const paymentLink = links.find((a) =>
        a.textContent?.includes("Payment Verification"),
      );
      const customerLink = links.find((a) =>
        a.textContent?.includes("Customers"),
      );

      expect(paymentLink).toBeTruthy();
      expect(customerLink).toBeTruthy();

      expect(paymentLink!.className).toContain("border-turmeric-400");
      expect(customerLink!.className).not.toContain("border-turmeric-400");
    });
  });
});
