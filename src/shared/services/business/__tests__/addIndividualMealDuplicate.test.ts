import { describe, it, expect, vi, beforeEach } from "vitest";

vi.useFakeTimers();
vi.setSystemTime(new Date("2026-10-01T04:00:00Z"));

import type { Order, Subscription, CustomerProfile, DeliveryPartnerProfile } from "@/shared/types";
import { orderService } from "../orderService";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemorySubscriptions: Map<string, Subscription> = new Map();
const inMemoryUsers: Map<string, any> = new Map();
const inMemorySkips: Map<string, any> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "admin-actor-1", email: "admin@example.com", displayName: "Admin Actor" },
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, collectionName, id, subCol, subId) => {
    if (subCol) {
      return { path: `${collectionName}/${id}/${subCol}/${subId}`, id: subId, collectionName: subCol, parentId: id };
    }
    return { path: `${collectionName}/${id}`, id, collectionName };
  }),
  collection: vi.fn((_db, colName, id, subCol) => {
    if (id && subCol) {
      return { path: `${colName}/${id}/${subCol}`, collectionName: subCol, orderId: id };
    }
    return { path: colName, collectionName: colName };
  }),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  serverTimestamp: vi.fn(() => new Date()),
  runTransaction: vi.fn(async (_db, cb) => {
    const txn = {
      get: vi.fn(async (docRef: any) => {
        if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
          const order = inMemoryOrders.get(docRef.id);
          return {
            id: docRef.id,
            exists: () => !!order,
            data: () => (order ? { ...order } : undefined),
          };
        }
        return {
          id: docRef.id,
          exists: () => false,
          data: () => undefined,
        };
      }),
      set: vi.fn((docRef: any, data: any, options?: { merge?: boolean }) => {
        if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
          const existing = inMemoryOrders.get(docRef.id);
          if (options?.merge && existing) {
            inMemoryOrders.set(docRef.id, { ...existing, ...data, id: docRef.id });
          } else {
            inMemoryOrders.set(docRef.id, { ...data, id: docRef.id });
          }
        } else if (docRef.collectionName === "workflowHistory") {
          const orderId = docRef.orderId || docRef.path?.split("/")[1];
          const list = inMemoryWorkflowHistory.get(orderId) || [];
          list.push(data);
          inMemoryWorkflowHistory.set(orderId, list);
        }
      }),
      update: vi.fn((docRef: any, data: any) => {
        if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
          const existing = inMemoryOrders.get(docRef.id);
          if (existing) {
            inMemoryOrders.set(docRef.id, { ...existing, ...data });
          }
        }
      }),
    };
    return await cb(txn);
  }),
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (id: string) => inMemoryUsers.get(id) || null),
    list: vi.fn(async (...constraints: any[]) => {
      let list = Array.from(inMemoryUsers.values());
      const flattened = constraints.flat();
      for (const c of flattened) {
        if (c?.field === "role" && c?.op === "==") {
          list = list.filter((u) => u.role === c.val);
        }
      }
      return list;
    }),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getById: vi.fn(async (id: string) => inMemorySubscriptions.get(id) || null),
    getActiveSubscriptionByCustomerId: vi.fn(async (custId: string) => {
      return Array.from(inMemorySubscriptions.values()).find(
        (s) => s.customerId === custId && (s.status === "active" || s.status === "paused")
      ) || null;
    }),
    removeSkip: vi.fn(async (subId: string, date: string) => {
      inMemorySkips.delete(`${subId}_${date}`);
    }),
  },
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    list: vi.fn(async (...constraints: any[]) => {
      let list = Array.from(inMemoryOrders.values());
      const flattened = constraints.flat();
      for (const c of flattened) {
        if (c?.field === "customerId" && c?.op === "==") {
          list = list.filter((o) => o.customerId === c.val);
        }
        if (c?.field === "date" && c?.op === "==") {
          list = list.filter((o) => o.date === c.val);
        }
      }
      return list;
    }),
    getById: vi.fn(async (id: string) => inMemoryOrders.get(id) || null),
  },
}));

vi.mock("@/shared/services/firestore/deliveryZoneRepository", () => ({
  deliveryZoneRepository: {
    list: vi.fn(async () => [
      { id: "zone-1", name: "Zone 1", kitchenId: "kitchen-1", isActive: true },
    ]),
  },
}));

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    getById: vi.fn(async (id: string) => ({
      id,
      name: "Standard Plan",
      tier: "standard",
      mealSlots: [{ mealType: "lunch", options: [{ id: "opt-1", label: "South Indian Thali" }] }],
    })),
  },
}));

vi.mock("@/shared/services/firestore/dailyMenuRepository", () => ({
  dailyMenuRepository: {
    getPublishedByDate: vi.fn(async () => null),
  },
}));

vi.mock("@/shared/services/firestore/holidayRepository", () => ({
  holidayRepository: {
    isHoliday: vi.fn(async () => false),
  },
}));

vi.mock("@/shared/services/business/operationalSettingsService", () => ({
  operationalSettingsService: {
    getOperationalSettings: vi.fn(async () => ({})),
    validateMealCutoff: vi.fn(() => {}),
    getDeliveryWindowSync: vi.fn(() => "12:00 PM - 01:30 PM"),
  },
}));

vi.mock("@/shared/services/business/pricingService", () => ({
  pricingService: {
    calculateMealPrice: vi.fn(() => 75),
    getEffectivePricing: vi.fn(async () => ({ breakfast: 40, lunch: 75, dinner: 75 })),
  },
}));

describe("🛡️ Duplicate Individual Meal Creation Invariant Tests", () => {
  const CUSTOMER_ID = "cust-100";
  const SUB_ID = "sub-200";
  const TEST_DATE = "2026-10-05"; // Non-Sunday, future date

  const sampleCustomer = {
    id: CUSTOMER_ID,
    fullName: "Ramesh Sharma",
    phone: "9876543210",
    role: "customer",
    addresses: [
      {
        id: "addr-1",
        line1: "123 Main St",
        city: "Mysuru",
        pincode: "570001",
        isDefault: true,
      },
    ],
    defaultAddressId: "addr-1",
    zoneId: "zone-1",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CustomerProfile;

  const sampleSubscription = {
    id: SUB_ID,
    customerId: CUSTOMER_ID,
    planId: "plan-std",
    planTier: "standard",
    quantity: 1,
    pricePerDaySnapshot: 140,
    pricingMatrixSnapshot: { lunch: 75 },
    deliveryAddressId: "addr-1",
    mealPreferences: [{ mealType: "lunch", selectedOptionId: "opt-1" }],
    status: "active",
    startDate: "2026-10-01",
    billingCycle: "monthly",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Subscription;

  const samplePartner = {
    id: "dp-1",
    fullName: "Suresh Driver",
    phone: "9123456780",
    role: "delivery_partner",
    isActive: true,
    isAvailable: true,
    zoneIds: ["zone-1"],
    shifts: ["lunch"],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DeliveryPartnerProfile;

  beforeEach(() => {
    inMemoryOrders.clear();
    inMemorySubscriptions.clear();
    inMemoryUsers.clear();
    inMemorySkips.clear();
    inMemoryWorkflowHistory.clear();

    inMemoryUsers.set(CUSTOMER_ID, sampleCustomer);
    inMemoryUsers.set("dp-1", samplePartner);
    inMemorySubscriptions.set(SUB_ID, sampleSubscription);
  });

  it("REJECTS: creating an individual meal when an active subscription order already exists for the slot", async () => {
    // Seed existing active subscription order for lunch on TEST_DATE
    const subOrderId = `ord_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(subOrderId, {
      id: subOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      status: "scheduled",
      price: 75,
      deliveryPartnerId: "dp-1",
    } as Order);

    await expect(
      orderService.addIndividualMeal({
        customerId: CUSTOMER_ID,
        subscriptionId: SUB_ID,
        date: TEST_DATE,
        mealType: "lunch",
      }),
    ).rejects.toThrow(/An active (.*)order already exists/);

    // Verify only the original order remains; no duplicate created
    expect(inMemoryOrders.size).toBe(1);
    expect(inMemoryOrders.has(subOrderId)).toBe(true);
  });

  it("REJECTS: repeated Admin attempt when an active one-time meal already exists (idempotency)", async () => {
    // Seed existing one-time addon order
    const addonOrderId = `ord_addon_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(addonOrderId, {
      id: addonOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      source: "one_time",
      status: "scheduled",
      price: 75,
    } as Order);

    await expect(
      orderService.addIndividualMeal({
        customerId: CUSTOMER_ID,
        subscriptionId: SUB_ID,
        date: TEST_DATE,
        mealType: "lunch",
      }),
    ).rejects.toThrow(/An active order already exists/);

    expect(inMemoryOrders.size).toBe(1);
  });

  it("REJECTS: repeated request when existing order is already 'in_preparation'", async () => {
    const addonOrderId = `ord_addon_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(addonOrderId, {
      id: addonOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      source: "one_time",
      status: "preparing",
      kitchenStatus: "preparing",
      deliveryPartnerId: "dp-1",
      driverName: "Suresh Driver",
    } as unknown as Order);

    await expect(
      orderService.addIndividualMeal({
        customerId: CUSTOMER_ID,
        subscriptionId: SUB_ID,
        date: TEST_DATE,
        mealType: "lunch",
      }),
    ).rejects.toThrow(/An active order already exists/);

    // Status, kitchenStatus, and delivery partner must NOT be reset or overwritten
    const order = inMemoryOrders.get(addonOrderId)!;
    expect(order.status).toBe("preparing");
    expect(order.kitchenStatus).toBe("preparing");
    expect(order.deliveryPartnerId).toBe("dp-1");
  });

  it("REJECTS: repeated request when existing order is 'out_for_delivery' or 'delivered'", async () => {
    const subOrderId = `ord_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(subOrderId, {
      id: subOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      status: "delivered",
      deliveryPartnerId: "dp-1",
    } as unknown as Order);

    await expect(
      orderService.addIndividualMeal({
        customerId: CUSTOMER_ID,
        subscriptionId: SUB_ID,
        date: TEST_DATE,
        mealType: "lunch",
      }),
    ).rejects.toThrow(/An active (.*)order already exists/);

    expect(inMemoryOrders.get(subOrderId)!.status).toBe("delivered");
  });

  it("ALLOWS: safely restoring an existing CANCELLED subscription order in-place without duplicate doc", async () => {
    const subOrderId = `ord_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(subOrderId, {
      id: subOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      status: "cancelled",
      cancellationAmount: 75,
      cancellationReason: "Customer cancelled",
    } as unknown as Order);

    const result = await orderService.addIndividualMeal({
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
    });

    // Exactly 1 order in Firestore, restored to scheduled
    expect(inMemoryOrders.size).toBe(1);
    expect(result.id).toBe(subOrderId);
    expect(result.status).toBe("scheduled");
    expect((result as any).cancellationAmount).toBeNull();
    expect((result as any).cancellationReason).toBeNull();
  });

  it("ALLOWS: safely restoring an existing SKIPPED order in-place without creating duplicate", async () => {
    const subOrderId = `ord_${SUB_ID}_${TEST_DATE}_lunch`;
    inMemoryOrders.set(subOrderId, {
      id: subOrderId,
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
      status: "skipped",
    } as Order);

    const result = await orderService.addIndividualMeal({
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
    });

    expect(inMemoryOrders.size).toBe(1);
    expect(result.id).toBe(subOrderId);
    expect(result.status).toBe("scheduled");
  });

  it("CREATES: brand new one-time order when no prior order exists for the date/slot", async () => {
    const result = await orderService.addIndividualMeal({
      customerId: CUSTOMER_ID,
      subscriptionId: SUB_ID,
      date: TEST_DATE,
      mealType: "lunch",
    });

    expect(inMemoryOrders.size).toBe(1);
    expect(result.status).toBe("scheduled");
    expect(result.source).toBe("one_time");
    expect(result.price).toBe(75);
  });
});
