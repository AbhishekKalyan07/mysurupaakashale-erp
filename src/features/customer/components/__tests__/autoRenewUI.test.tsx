import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";

// Mock child modals that depend on Leaflet or external state
vi.mock("@/features/customer/components/AddressPicker", () => ({
  AddressPicker: () => <div data-testid="mock-address-picker" />,
}));
vi.mock("@/features/customer/components/MapPinPicker", () => ({
  MapPinPicker: () => null,
}));

// Mock hooks used by SubscriptionDetailsPage
const mockUseMySubscription = vi.fn();
const mockUseMealPlans = vi.fn();
const mockUseCustomerAddresses = vi.fn();
const mockUseMyPayments = vi.fn();
const mockUseBusinessSettings = vi.fn();
const mockUseAuth = vi.fn();
const mockUseSubscriptionStats = vi.fn();

vi.mock("@/features/customer/hooks/useMySubscription", () => ({
  useMySubscription: () => mockUseMySubscription(),
  useSubscriptionStats: () => mockUseSubscriptionStats(),
  useSkipDay: () => ({ mutate: vi.fn(), isPending: false }),
  useUnskipDay: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTodayMeal: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/customer/hooks/useMealPlans", () => ({
  useMealPlans: () => mockUseMealPlans(),
}));

vi.mock("@/features/customer/hooks/useCustomerAddresses", () => ({
  useCustomerAddresses: () => mockUseCustomerAddresses(),
}));

vi.mock("@/features/customer/hooks/usePayments", () => ({
  useMyPayments: () => mockUseMyPayments(),
}));

vi.mock("@/features/admin/hooks/useSettings", () => ({
  useBusinessSettings: () => mockUseBusinessSettings(),
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

import { SubscriptionDetailsPage } from "@/features/customer/pages/SubscriptionDetailsPage";

describe("Scenario 2 & 3 — Auto-Renew UI & Persisted State Verification", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let queryClient: QueryClient;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container!);

    // Default mock hook returns
    mockUseMealPlans.mockReturnValue({
      data: [{ id: "plan-1", name: "Standard Plan", pricePerDay: 100 }],
      isLoading: false,
    });
    mockUseCustomerAddresses.mockReturnValue({
      addresses: [{ id: "addr-1", label: "Home", line1: "123 Main St", city: "Mysuru" }],
      isLoading: false,
    });
    mockUseMyPayments.mockReturnValue({ data: [], isLoading: false });
    mockUseBusinessSettings.mockReturnValue({
      data: { pricing: { securityDepositAmount: 1000 } },
      isLoading: false,
    });
    mockUseAuth.mockReturnValue({
      profile: { id: "cust-1", fullName: "Alice", role: "customer" },
    });
    mockUseSubscriptionStats.mockReturnValue({ data: null, isLoading: false });
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
  });

  it("displays Auto-Renew switch ON when subscription has autoRenew = true", async () => {
    mockUseMySubscription.mockReturnValue({
      data: {
        id: "sub-1",
        customerId: "cust-1",
        planId: "plan-1",
        status: "active",
        autoRenew: true,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        mealPreferences: [{ mealType: "lunch" }],
      },
      isLoading: false,
    });

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SubscriptionDetailsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const switchBtn = container!.querySelector('button[role="switch"]');
    expect(switchBtn).not.toBeNull();
    expect(switchBtn!.getAttribute("aria-checked")).toBe("true");
    expect(switchBtn!.className).toContain("bg-emerald-600");
    expect(container!.textContent).toContain("Your subscription will renew automatically.");
  });

  it("CRITICAL: displays Auto-Renew switch OFF when subscription has autoRenew = false (no false positive)", async () => {
    mockUseMySubscription.mockReturnValue({
      data: {
        id: "sub-1",
        customerId: "cust-1",
        planId: "plan-1",
        status: "active",
        autoRenew: false, // Explicitly false
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        mealPreferences: [{ mealType: "lunch" }],
      },
      isLoading: false,
    });

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SubscriptionDetailsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const switchBtn = container!.querySelector('button[role="switch"]');
    expect(switchBtn).not.toBeNull();
    expect(switchBtn!.getAttribute("aria-checked")).toBe("false");
    expect(switchBtn!.className).toContain("bg-rice-300");
    expect(switchBtn!.className).not.toContain("bg-emerald-600");
    expect(container!.textContent).toContain("Subscription will expire at cycle end.");
  });

  it("customer disabling auto-renew calls subscriptionRepository.update with autoRenew = false", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    mockUseMySubscription.mockReturnValue({
      data: {
        id: "sub-toggle",
        customerId: "cust-1",
        planId: "plan-1",
        status: "active",
        autoRenew: true,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        mealPreferences: [{ mealType: "lunch" }],
      },
      isLoading: false,
    });

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SubscriptionDetailsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const switchBtn = container!.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(switchBtn).not.toBeNull();

    await act(async () => {
      switchBtn.click();
    });

    expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to disable auto-renew?");
    expect(subscriptionRepository.update).toHaveBeenCalledWith("sub-toggle", {
      autoRenew: false,
    });
  });
});
