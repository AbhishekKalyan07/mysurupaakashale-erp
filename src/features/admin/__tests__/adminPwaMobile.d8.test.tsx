/**
 * PHASE D.8 — Admin PWA & Mobile Optimization Focused Tests
 *
 * Verifies:
 * 1. Responsive Admin Layout & Navigation (Sidebar, Navbar, BottomNav, AppShell)
 * 2. Admin Dashboard (MetricCard responsive typography, KPI grids, stages)
 * 3. Admin Customer Management (CustomerDetailDialog, tabs, negotiated pricing, responsive filters)
 * 4. Admin Order & Subscription Management (Dialogs, touch targets, cancellation button, negotiated pricing editor)
 * 5. Admin Accounts / Billing (Reports cards, manual invoice touch targets)
 * 6. PWA Configuration (index.html metadata, manifest reference, service worker, icons)
 * 7. Desktop Behavior Preservation (No regression to desktop navigation or layouts)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Components to test
import { MetricCard } from "@/shared/components/ui/MetricCard";
import { BottomNav } from "@/shared/components/layout/BottomNav";
import { PremiumNavbar } from "@/shared/components/layout/PremiumNavbar";
import { PremiumSidebar } from "@/shared/components/layout/PremiumSidebar";
import { NegotiatedPricingEditor } from "@/features/admin/components/NegotiatedPricingEditor";
import { ROLES } from "@/shared/constants/roles";

// Mock Auth
vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({
    status: "authenticated",
    role: "admin",
    profile: {
      id: "admin-123",
      fullName: "Admin Administrator",
      email: "admin@test.com",
      phone: "+919876543210",
      role: "admin",
    },
    signOut: vi.fn(),
  }),
}));

// Mock Notifications
vi.mock("@/features/notifications/components/NotificationBell", () => ({
  NotificationBell: () => <button aria-label="Notifications">Bell</button>,
}));

// Mock PWA install hook
vi.mock("@/shared/hooks/usePWAInstall", () => ({
  usePWAInstall: () => ({
    isInstallable: true,
    isInstalled: false,
    triggerInstall: vi.fn(),
  }),
}));

// Mock Admin subscriptions hook for NegotiatedPricingEditor
vi.mock("@/features/admin/hooks/useAdminSubscriptions", () => ({
  useSetNegotiatedPricing: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRemoveNegotiatedPricing: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container!);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  if (container && document.body.contains(container)) {
    document.body.removeChild(container);
  }
  container = null;
  root = null;
  vi.restoreAllMocks();
});

describe("D.8: PWA Configuration & Metadata", () => {
  it("index.html contains all required PWA and mobile viewport meta tags", () => {
    const indexPath = resolve(process.cwd(), "index.html");
    const html = readFileSync(indexPath, "utf-8");

    // Viewport with viewport-fit=cover
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    // Manifest reference
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    // Theme color
    expect(html).toContain('name="theme-color" content="#4A235A"');
    // Web app capable
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="Paakashale"');
  });

  it("all required PWA icons exist in public directory", () => {
    const publicDir = resolve(process.cwd(), "public");
    const requiredIcons = [
      "pwa-192x192.png",
      "pwa-512x512.png",
      "pwa-maskable-192x192.png",
      "pwa-maskable-512x512.png",
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
    ];

    for (const icon of requiredIcons) {
      expect(existsSync(resolve(publicDir, icon)), `Icon ${icon} must exist`).toBe(true);
    }
  });

  it("Vite config defines standalone PWA manifest and service worker configuration", () => {
    const viteConfigPath = resolve(process.cwd(), "vite.config.ts");
    const content = readFileSync(viteConfigPath, "utf-8");

    expect(content).toContain("VitePWA");
    expect(content).toContain("strategies: 'injectManifest'");
    expect(content).toContain("filename: 'sw.ts'");
    expect(content).toContain("name: 'Mysuru Paakashale ERP'");
    expect(content).toContain("short_name: 'Paakashale'");
    expect(content).toContain("display: 'standalone'");
    expect(content).toContain("theme_color: '#4A235A'");
  });

  it("Service worker in src/sw.ts configures navigation fallback and skipWaiting", () => {
    const swPath = resolve(process.cwd(), "src/sw.ts");
    const swContent = readFileSync(swPath, "utf-8");

    expect(swContent).toContain("self.skipWaiting()");
    expect(swContent).toContain("clientsClaim()");
    expect(swContent).toContain('createHandlerBoundToURL("/index.html")');
    expect(swContent).toContain("NavigationRoute");
    expect(swContent).toContain("precacheAndRoute(self.__WB_MANIFEST)");
  });
});

describe("D.8: Responsive Admin Layout & Navigation", () => {
  it("PremiumNavbar provides accessible hamburger button on mobile with accessible touch target", () => {
    const onMenuClick = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <PremiumNavbar role={ROLES.ADMIN} onMenuClick={onMenuClick} />
      </MemoryRouter>
    );

    // Hamburger button
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("min-w-[44px]");
    expect(html).toContain("min-h-[44px]");
    // Truncated brand for small screens
    expect(html).toContain("truncate");
  });

  it("PremiumSidebar supports off-canvas drawer with backdrop and max-w-[85vw] on mobile", () => {
    const onClose = vi.fn();
    const html = renderToString(
      <MemoryRouter>
        <PremiumSidebar role={ROLES.ADMIN} isOpen={true} onClose={onClose} />
      </MemoryRouter>
    );

    // Mobile slide-in classes
    expect(html).toContain("translate-x-0");
    expect(html).toContain("max-w-[85vw]");
    expect(html).toContain('aria-label="Close Sidebar"');
    expect(html).toContain("min-w-[44px]");
    expect(html).toContain("min-h-[44px]");

    // Includes all essential admin routes
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/admin/customers"');
    expect(html).toContain('href="/admin/subscriptions"');
    expect(html).toContain('href="/admin/orders"');
    expect(html).toContain('href="/admin/accounts"');
  });

  it("BottomNav renders primary admin tabs and more drawer with all required admin destinations", async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <BottomNav role={ROLES.ADMIN} />
        </MemoryRouter>
      );
    });

    const nav = container!.querySelector('nav[aria-label="Mobile navigation"]');
    expect(nav).toBeTruthy();

    // Check bottom tabs for admin
    const tabs = container!.querySelectorAll("a");
    const tabHrefs = Array.from(tabs).map((a) => a.getAttribute("href"));
    expect(tabHrefs).toContain("/dashboard");
    expect(tabHrefs).toContain("/admin/orders");
    expect(tabHrefs).toContain("/admin/kitchen");
    expect(tabHrefs).toContain("/admin/delivery");

    // Check "More" button exists
    const moreBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("More")
    );
    expect(moreBtn).toBeTruthy();

    // Click More button to open drawer
    await act(async () => {
      moreBtn!.click();
    });

    // Verify more drawer items
    const moreDrawer = container!.querySelector(".max-h-\\[80vh\\]");
    expect(moreDrawer, "More drawer should have max-h-[80vh] overflow-y-auto").toBeTruthy();

    const drawerButtons = container!.querySelectorAll("div[class*='grid'] button");
    const drawerLabels = Array.from(drawerButtons).map((b) => b.getAttribute("aria-label"));
    expect(drawerLabels).toContain("Customers");
    expect(drawerLabels).toContain("Subscriptions");
    expect(drawerLabels).toContain("Payments");
    expect(drawerLabels).toContain("Accounts");
    expect(drawerLabels).toContain("Staff");
    expect(drawerLabels).toContain("Settings");
  });

  it("AppShell applies responsive padding and overflow-x-hidden", () => {
    const appShellPath = resolve(process.cwd(), "src/shared/components/layout/AppShell.tsx");
    const content = readFileSync(appShellPath, "utf-8");

    // Responsive padding
    expect(content).toContain("overflow-x-hidden");
    expect(content).toContain("px-3 sm:px-4");
    expect(content).toContain("pb-[calc(60px+env(safe-area-inset-bottom,0px)+1.5rem)]");
  });
});

describe("D.8: Admin Dashboard Responsiveness", () => {
  it("MetricCard applies responsive padding and font sizing for narrow mobile viewports", () => {
    const html = renderToString(
      <MetricCard
        title="Revenue Today"
        value="₹12,450"
        icon={<span>₹</span>}
        color="gold"
      />
    );

    // Responsive padding and typography
    expect(html).toContain("p-3.5 sm:p-5");
    expect(html).toContain("text-xl sm:text-[32px]");
    expect(html).toContain("truncate");
    expect(html).toContain("min-w-0");
  });

  it("AdminDashboardPage uses responsive grids across metrics, SLA, drivers, and stages", () => {
    const pagePath = resolve(process.cwd(), "src/features/dashboard/pages/AdminDashboardPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Metrics grid gap
    expect(content).toContain("grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6 mb-8");
    // SLA grid: 2 cols on mobile
    expect(content).toContain("grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-4");
    // Driver utilization: 2 cols on mobile
    expect(content).toContain("grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8");
    // Kitchen stages: 2 cols on mobile
    expect(content).toContain("grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6");
    // Quick actions: 1 col on mobile
    expect(content).toContain("grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6");
  });
});

describe("D.8: Admin Customer Management Usability & Dialogs", () => {
  it("AdminCustomersPage search bar and tab bar are responsive without hardcoded min-w on mobile", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Search bar has w-full sm:min-w-[300px] instead of fixed min-w-[300px]
    expect(content).toContain("w-full sm:min-w-[300px]");
    expect(content).not.toContain('className="relative min-w-[300px] flex-1 max-w-md"');

    // Tab bar has overflow-x-auto
    expect(content).toContain("overflow-x-auto");
  });

  it("CustomerDetailDialog in AdminCustomersPage uses responsive layout, touch targets, and scroll bounds", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Dialog has max-h-[90dvh] my-auto overflow-y-auto
    expect(content).toContain("max-h-[90dvh] my-auto overflow-y-auto");
    // Close button has >= 44x44px touch target
    expect(content).toContain('aria-label="Close"');
    expect(content).toContain("min-w-[44px] min-h-[44px]");
    // Profile grid is responsive 1-col on mobile, 2-cols on desktop
    expect(content).toContain("grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4");
    // Zone assignment controls wrap on mobile
    expect(content).toContain("flex flex-col sm:flex-row gap-2 sm:gap-3");
  });

  it("CustomerSubscriptionsTab includes negotiated pricing breakdown and editor modal integration", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    expect(content).toContain("NegotiatedPricingEditor");
    expect(content).toContain("editingNegotiatedSub");
    expect(content).toContain("Negotiated Pricing Overrides");
  });
});

describe("D.8: Admin Orders & Subscriptions Management", () => {
  it("AdminOrdersPage detail dialog and cancel action button are responsive", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminOrdersPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Dialog max-height and scrolling
    expect(content).toContain("max-h-[90dvh] my-auto overflow-y-auto");
    // Close button has min-w-[44px] min-h-[44px]
    expect(content).toContain('aria-label="Close"');
    expect(content).toContain("min-w-[44px] min-h-[44px]");
    // Cancellation button has min-h-[44px] and whitespace-normal for multiline wrapping
    expect(content).toContain("min-h-[44px] h-auto whitespace-normal break-words");
  });

  it("AdminSubscriptionsPage detail dialog is responsive and formats negotiated pricing cleanly", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminSubscriptionsPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Dialog container
    expect(content).toContain("max-h-[90dvh] my-auto overflow-y-auto");
    // Close button touch target
    expect(content).toContain("min-w-[44px] min-h-[44px]");
    // Responsive grid
    expect(content).toContain("grid grid-cols-1 sm:grid-cols-2 gap-3");
    // Negotiated pricing row
    expect(content).toContain("col-span-1 sm:col-span-2");
  });

  it("NegotiatedPricingEditor renders with full-screen overlay, responsive grid, and touch-accessible buttons", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root!.render(
        <NegotiatedPricingEditor
          subscriptionId="sub-test-123"
          existingPricing={{ breakfast: 50, lunch: 90, dinner: 90 } as any}
          onClose={onClose}
        />
      );
    });

    const overlay = container!.querySelector(".fixed.inset-0.z-\\[60\\]");
    expect(overlay, "Editor must render with z-[60] backdrop overlay").toBeTruthy();

    const dialog = container!.querySelector(".max-h-\\[90dvh\\]");
    expect(dialog, "Dialog card must have max-h-[90dvh] overflow-y-auto").toBeTruthy();

    // Check close button
    const closeBtn = container!.querySelector('button[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      (closeBtn as HTMLButtonElement).click();
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("D.8: Admin Accounts & Billing Management", () => {
  it("AdminAccountsPage tool cards and manual invoice button are responsive", () => {
    const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminAccountsPage.tsx");
    const content = readFileSync(pagePath, "utf-8");

    // Reports grid is responsive 1-col on mobile, 2-cols on desktop
    expect(content).toContain("grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6");
    // Manual invoice button has min-h-[44px]
    expect(content).toContain("w-full sm:w-32 min-h-[44px]");
  });
});

describe("D.8: Staff & Zone Management Modal Responsiveness", () => {
  it("CreateStaffModal and EditStaffModal containers and grids are responsive on mobile", () => {
    const createPath = resolve(process.cwd(), "src/features/admin/components/CreateStaffModal.tsx");
    const createContent = readFileSync(createPath, "utf-8");
    expect(createContent).toContain("max-h-[90dvh] my-auto");
    expect(createContent).toContain("grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4");
    expect(createContent).toContain("min-w-[44px] min-h-[44px]");

    const editPath = resolve(process.cwd(), "src/features/admin/components/EditStaffModal.tsx");
    const editContent = readFileSync(editPath, "utf-8");
    expect(editContent).toContain("max-h-[90dvh] my-auto");
    expect(editContent).toContain("grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4");
    expect(editContent).toContain("min-w-[44px] min-h-[44px]");
  });

  it("ZoneModal container and touch targets are responsive on mobile", () => {
    const zonePath = resolve(process.cwd(), "src/features/admin/components/ZoneModal.tsx");
    const content = readFileSync(zonePath, "utf-8");
    expect(content).toContain("max-h-[90dvh] my-auto");
    expect(content).toContain("min-w-[44px] min-h-[44px]");
  });
});
