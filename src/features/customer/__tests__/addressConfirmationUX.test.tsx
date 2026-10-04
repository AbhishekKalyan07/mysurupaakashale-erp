import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isMysuruCityPincode, MYSURU_CITY_PINCODES } from "@/shared/services/business/operationalRouter";

// Mocks for SubscriptionWizardPage tests
const mockUseMealPlans = vi.fn();
const mockUseCustomerAddresses = vi.fn();
const mockUseBusinessSettings = vi.fn();
const mockUseMySubscription = vi.fn();
const mockUseAuth = vi.fn();
const mockAddAddress = vi.fn();

vi.mock("@/features/customer/hooks/useMealPlans", () => ({
  useMealPlans: () => mockUseMealPlans(),
}));

vi.mock("@/features/customer/hooks/useCustomerAddresses", () => ({
  useCustomerAddresses: () => mockUseCustomerAddresses(),
}));

vi.mock("@/features/admin/hooks/useSettings", () => ({
  useBusinessSettings: () => mockUseBusinessSettings(),
}));

vi.mock("@/features/customer/hooks/useMySubscription", () => ({
  useMySubscription: () => mockUseMySubscription(),
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock Leaflet and manual payment panel
vi.mock("@/features/customer/components/AddressPicker", () => ({
  AddressPicker: () => <div data-testid="mock-address-picker" />,
}));
vi.mock("@/features/customer/components/MapPinPicker", () => ({
  MapPinPicker: () => null,
}));
vi.mock("@/features/customer/components/ManualPaymentPanel", () => ({
  ManualPaymentPanel: () => null,
}));

import { SubscriptionWizardPage } from "../pages/SubscriptionWizardPage";

describe("Address & Pincode Confirmation UX (Part 3 & Part 8 Requirements)", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUseAuth.mockReturnValue({
      firebaseUser: { uid: "test-cust-1", email: "cust@test.com" },
    });

    mockUseMealPlans.mockReturnValue({
      data: [
        {
          id: "plan-1",
          name: "Standard Plan",
          tier: "standard",
          pricePerDay: 150,
          isActive: true,
          pricingMatrix: { breakfast_lunch_dinner: 150 },
          mealSlots: [
            {
              mealType: "breakfast",
              options: [
                {
                  id: "b1",
                  name: "Idli",
                  label: "Idli & Vada",
                  items: ["Idli", "Vada", "Chutney"],
                  isActive: true,
                  isCustomerSelectable: true,
                },
              ],
            },
            {
              mealType: "lunch",
              options: [
                {
                  id: "l1",
                  name: "Thali",
                  label: "South Indian Thali",
                  items: ["Rice", "Sambar", "Palya"],
                  isActive: true,
                  isCustomerSelectable: true,
                },
              ],
            },
            {
              mealType: "dinner",
              options: [
                {
                  id: "d1",
                  name: "Roti",
                  label: "Roti & Curry",
                  items: ["Chapati", "Subzi", "Dal"],
                  isActive: true,
                  isCustomerSelectable: true,
                },
              ],
            },
          ],
        },
      ],
      isLoading: false,
      error: null,
    });

    mockUseBusinessSettings.mockReturnValue({
      data: { pricing: { securityDepositAmount: 1000 } },
      isLoading: false,
    });

    mockUseMySubscription.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockAddAddress.mockReset();
    mockUseCustomerAddresses.mockReturnValue({
      addresses: [
        {
          id: "addr-mysuru",
          label: "Home",
          line1: "123 Saraswathipuram",
          city: "Mysuru",
          state: "Karnataka",
          pincode: "570009",
          isDefault: true,
        },
        {
          id: "addr-outside",
          label: "Bangalore Office",
          line1: "456 Indiranagar",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560038",
          isDefault: false,
        },
      ],
      addAddress: mockAddAddress,
      isAdding: false,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    if (container) {
      container.remove();
    }
  });

  it("Step 2 does NOT automatically confirm or pre-select any address on load", async () => {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/subscribe"]}>
            <SubscriptionWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Advance to Step 2
    const nextBtn = container!.querySelector("button:not([disabled])") as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();

    // Find and click "Proceed to Delivery Address"
    const buttons = Array.from(container!.querySelectorAll("button"));
    const proceedBtn = buttons.find((b) => b.textContent?.includes("Continue to Address"));
    expect(proceedBtn).toBeDefined();

    await act(async () => {
      proceedBtn!.click();
    });

    // In Step 2, "Confirm Address & Review Order" should be disabled because no address was auto-selected
    const reviewBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Address & Review Order")
    );
    expect(reviewBtn).toBeDefined();
    expect(reviewBtn!.disabled).toBe(true);

    // Verify neither address is auto-confirmed as selected
    const confirmedBadges = container!.querySelectorAll(".text-emerald-700");
    const hasConfirmedText = Array.from(confirmedBadges).some((el) =>
      el.textContent?.includes("Confirmed Delivery Address")
    );
    expect(hasConfirmedText).toBe(false);
  });

  it("displays serviceability badges for saved addresses (serviceable vs outside Mysuru)", async () => {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/subscribe"]}>
            <SubscriptionWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Advance to Step 2
    const proceedBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue to Address")
    );
    await act(async () => {
      proceedBtn!.click();
    });

    const bodyText = container!.textContent || "";
    expect(bodyText).toContain("✓ Serviceable");
    expect(bodyText).toContain("✕ Outside Mysuru");
  });

  it("clicking an unserviceable address does not allow selection and leaves review disabled", async () => {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/subscribe"]}>
            <SubscriptionWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Advance to Step 2
    const proceedBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue to Address")
    );
    await act(async () => {
      proceedBtn!.click();
    });

    // Find card for Bangalore Office (560038)
    const cards = Array.from(container!.querySelectorAll(".cursor-pointer"));
    const unserviceableCard = cards.find((c) => c.textContent?.includes("Bangalore Office")) as HTMLElement;
    expect(unserviceableCard).toBeDefined();

    await act(async () => {
      unserviceableCard.click();
    });

    // Review button must still be disabled
    const reviewBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Address & Review Order")
    );
    expect(reviewBtn!.disabled).toBe(true);
  });

  it("clicking a serviceable address explicitly selects it and enables confirmation", async () => {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/subscribe"]}>
            <SubscriptionWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Advance to Step 2
    const proceedBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue to Address")
    );
    await act(async () => {
      proceedBtn!.click();
    });

    // Find card for Saraswathipuram (570009)
    const cards = Array.from(container!.querySelectorAll(".cursor-pointer"));
    const serviceableCard = cards.find((c) => c.textContent?.includes("123 Saraswathipuram")) as HTMLElement;
    expect(serviceableCard).toBeDefined();

    await act(async () => {
      serviceableCard.click();
    });

    // Now review button must be enabled
    const reviewBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Address & Review Order")
    );
    expect(reviewBtn!.disabled).toBe(false);

    // Shows Confirmed Delivery Address badge
    expect(container!.textContent).toContain("Confirmed Delivery Address");
  });

  it("verifies isMysuruCityPincode distinguishes verified 32 pincodes from unsupported ones", () => {
    // Exactly 32 verified Mysuru City pincodes
    expect(MYSURU_CITY_PINCODES).toHaveLength(32);
    for (const pin of MYSURU_CITY_PINCODES) {
      expect(isMysuruCityPincode(pin)).toBe(true);
    }

    // Key required specific test pincodes
    expect(isMysuruCityPincode("570013")).toBe(true);
    expect(isMysuruCityPincode("570021")).toBe(true);
    expect(isMysuruCityPincode("570024")).toBe(true);
    expect(isMysuruCityPincode("570025")).toBe(true);
    expect(isMysuruCityPincode("570026")).toBe(true);
    expect(isMysuruCityPincode("570027")).toBe(true);
    expect(isMysuruCityPincode("570028")).toBe(true);
    expect(isMysuruCityPincode("570029")).toBe(true);
    expect(isMysuruCityPincode("570030")).toBe(true);
    expect(isMysuruCityPincode("570031")).toBe(true);
    expect(isMysuruCityPincode("570032")).toBe(true);

    // 570033 must NOT be included or configured
    expect(isMysuruCityPincode("570033")).toBe(false);
    expect(MYSURU_CITY_PINCODES).not.toContain("570033");

    // Unsupported pincodes
    expect(isMysuruCityPincode("570034")).toBe(false);
    expect(isMysuruCityPincode("570099")).toBe(false);
    expect(isMysuruCityPincode("571001")).toBe(false);
    expect(isMysuruCityPincode("560001")).toBe(false);
    expect(isMysuruCityPincode("600001")).toBe(false);
  });

  it("an address without a pincode is displayed as undetermined serviceability and can still be selected", async () => {
    mockUseCustomerAddresses.mockReturnValue({
      addresses: [
        {
          id: "addr-no-pin",
          label: "Mysuru Central Home",
          line1: "10 Kuvempunagar",
          city: "Mysuru",
          state: "Karnataka",
          // pincode omitted
          isDefault: true,
        },
      ],
      addAddress: mockAddAddress,
      isAdding: false,
    });

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/subscribe"]}>
            <SubscriptionWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Advance to Step 2
    const proceedBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue to Address")
    );
    await act(async () => {
      proceedBtn!.click();
    });

    // Address card with no pincode should show "Serviceability cannot be determined yet"
    // and must NOT falsely claim "✓ Serviceable" or "Outside Mysuru"
    expect(container!.textContent).toContain("Serviceability cannot be determined yet");
    expect(container!.textContent).not.toContain("Outside Mysuru");
    expect(container!.textContent).not.toContain("✓ Serviceable");

    // Select the address
    const cards = Array.from(container!.querySelectorAll(".cursor-pointer"));
    const noPinCard = cards.find((c) => c.textContent?.includes("10 Kuvempunagar")) as HTMLElement;
    expect(noPinCard).toBeDefined();

    await act(async () => {
      noPinCard.click();
    });

    // Confirmation button should be enabled
    const reviewBtn = Array.from(container!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Address & Review Order")
    );
    expect(reviewBtn!.disabled).toBe(false);
  });
});
