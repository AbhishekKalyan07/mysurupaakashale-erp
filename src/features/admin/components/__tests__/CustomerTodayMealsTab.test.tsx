import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerTodayMealsTab } from "../CustomerTodayMealsTab";
import type { MealPlan } from "@/shared/types";

// In-memory test state
const mockCustomer: any = {
  id: "cust-1",
  fullName: "Kalyan Kumar",
  email: "kalyan@example.com",
  phone: "9876543210",
  displayId: "CUST-001",
  isActive: true,
  role: "customer",
  addresses: [
    {
      id: "addr-1",
      label: "Home",
      line1: "123 Temple Road",
      city: "Mysuru",
      pincode: "570001",
      isDefault: true,
      state: "Karnataka",
      lat: 12.3,
      lng: 76.6,
    },
  ],
  createdAt: "2026-01-01" as any,
  updatedAt: "2026-01-01" as any,
};

const mockSub: any = {
  id: "sub-1",
  customerId: "cust-1",
  planId: "plan-regular",
  planTier: "regular",
  status: "active",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  billingCycle: "monthly",
  autoRenew: true,
  quantity: 1,
  pricePerDaySnapshot: 210,
  mealPreferences: [
    { mealType: "breakfast", selectedOptionId: null },
    { mealType: "lunch", selectedOptionId: "opt_l1" },
    { mealType: "dinner", selectedOptionId: "opt_d1" },
  ],
  deliveryAddressId: "addr-1",
  zoneId: "zone-1",
  createdAt: "2026-09-01" as any,
  updatedAt: "2026-09-01" as any,
};

const mockPlan: MealPlan = {
  id: "plan-regular",
  tier: "regular",
  name: "Regular South Indian Plan",
  description: "Standard daily meals",
  pricePerDay: 210,
  currency: "INR",
  deliveryIncluded: true,
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01" as any,
  updatedAt: "2026-01-01" as any,
  mealSlots: [
    {
      mealType: "breakfast",
      isCustomerSelectable: false,
      options: [{ id: "opt_b1", label: "Idli Sambar Vada", items: ["Idli", "Sambar"] }],
    },
    {
      mealType: "lunch",
      isCustomerSelectable: true,
      options: [
        { id: "opt_l1", label: "South Indian Thali", items: ["Rice", "Sambar"] },
        { id: "opt_l2", label: "North Indian Thali", items: ["Roti", "Dal"] },
      ],
    },
    {
      mealType: "dinner",
      isCustomerSelectable: true,
      options: [
        { id: "opt_d1", label: "Light Dinner", items: ["Phulka", "Curry"] },
      ],
    },
  ],
};

const mockLunchOrder: any = {
  id: "ord_sub-1_2026-09-28_lunch",
  customerId: "cust-1",
  subscriptionId: "sub-1",
  date: "2026-09-28",
  mealType: "lunch",
  status: "scheduled",
  kitchenStatus: "scheduled",
  price: 85,
  mealName: "South Indian Thali",
  selectedOptionId: "opt_l1",
  source: "subscription",
  currency: "INR",
  zoneId: "zone-1",
  kitchenId: "kitchen-1",
  createdAt: "2026-09-28T04:00:00Z" as any,
  updatedAt: "2026-09-28T04:00:00Z" as any,
};

const mockAddonOrder: any = {
  id: "ord_sub-1_2026-09-28_addon_paneer",
  customerId: "cust-1",
  subscriptionId: "sub-1",
  date: "2026-09-28",
  mealType: "lunch",
  status: "scheduled",
  kitchenStatus: "scheduled",
  price: 40,
  mealName: "Paneer Add-on (Add-on)",
  source: "subscription",
  currency: "INR",
  isAddon: true,
  addonId: "addon_paneer",
  addonName: "Paneer Add-on",
  addonQuantity: 1,
  addonUnitPrice: 40,
  zoneId: "zone-1",
  kitchenId: "kitchen-1",
  createdAt: "2026-09-28T04:00:00Z" as any,
  updatedAt: "2026-09-28T04:00:00Z" as any,
};

// Mock dependencies
vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getByCustomerId: vi.fn(async () => [mockSub]),
  },
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    getCustomerOrdersByDate: vi.fn(async () => [mockLunchOrder, mockAddonOrder]),
    subscribeToCustomerOrders: vi.fn(() => () => {}),
  },
}));

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    list: vi.fn(async () => [mockPlan]),
  },
}));

vi.mock("@/shared/utils/dateUtils", () => ({
  getTodayIST: () => "2026-09-28",
  getModifiableMeals: (_date: string, meals: string[]) => meals, // all modifiable in test
}));

describe("CustomerTodayMealsTab UI Component", () => {
  let container: HTMLDivElement;
  let root: any;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  async function renderTab() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CustomerTodayMealsTab customer={mockCustomer} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  it("renders Today's Meals header and subscription details", async () => {
    await renderTab();

    expect(container.textContent).toContain("Today's Meals");
    expect(container.textContent).toContain("Kalyan Kumar");
    expect(container.textContent).toContain("regular Plan");
  });

  it("renders scheduled lunch meal with Remove and Change Option buttons", async () => {
    await renderTab();

    expect(container.textContent).toContain("South Indian Thali");
    expect(container.textContent).toContain("Remove lunch");
    expect(container.textContent).toContain("Change Option");
  });

  it("renders today's add-on section distinguishing add-ons from subscription meals", async () => {
    await renderTab();

    expect(container.textContent).toContain("Today's Add-ons");
    expect(container.textContent).toContain("Paneer Add-on");
    expect(container.textContent).toContain("₹40");
  });

  it("clicking Remove Lunch opens confirmation modal with cancellation adjustment preview", async () => {
    await renderTab();

    const removeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Remove lunch"),
    );
    expect(removeBtn).toBeDefined();

    await act(async () => {
      removeBtn?.click();
    });

    // Check modal contents
    expect(container.textContent).toContain("Cancellation Adjustment:");
    expect(container.textContent).toContain("₹85"); // Regular lunch rate
    expect(container.textContent).toContain("Confirm Removal");
  });

  it("clicking Change Option opens modal showing current option and ₹0 price difference", async () => {
    await renderTab();

    const changeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Change Option"),
    );
    expect(changeBtn).toBeDefined();

    await act(async () => {
      changeBtn?.click();
    });

    // Check modal contents
    expect(container.textContent).toContain("Change Today's lunch Option");
    expect(container.textContent).toContain("Price Difference:");
    expect(container.textContent).toContain("₹0 (Same-slot substitution)");
    expect(container.textContent).toContain("North Indian Thali");
    expect(container.textContent).toContain("Confirm Option Change");
  });
});
