import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription, Invoice } from "@/shared/types";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryInvoices: Map<string, Invoice> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemoryAuditLogs: any[] = [];

// Mock Firebase
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" },
  },
}));

let txnQueue = Promise.resolve();

vi.mock("firebase/firestore", () => ({
  runTransaction: vi.fn(async (_db, cb) => {
    const run = txnQueue.then(async () => {
      const txn = {
        get: vi.fn(async (docRef: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            const order = inMemoryOrders.get(docRef.id);
            return {
              exists: () => !!order,
              data: () => (order ? { ...order } : undefined),
            };
          }
          if (docRef.collectionName === "invoices" || docRef.path?.startsWith("invoices/")) {
            const invoice = inMemoryInvoices.get(docRef.id);
            return {
              exists: () => !!invoice,
              data: () => (invoice ? { ...invoice } : undefined),
            };
          }
          return {
            exists: () => false,
            data: () => undefined,
          };
        }),
        set: vi.fn((docRef: any, data: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            inMemoryOrders.set(docRef.id, { ...data, id: docRef.id });
          } else if (docRef.collectionName === "invoices" || docRef.path?.startsWith("invoices/")) {
            inMemoryInvoices.set(docRef.id, { ...data, id: docRef.id });
          } else if (docRef.collectionName === "workflowHistory") {
            const orderId = docRef.orderId;
            const list = inMemoryWorkflowHistory.get(orderId) || [];
            list.push(data);
            inMemoryWorkflowHistory.set(orderId, list);
          }
        }),
        update: vi.fn((docRef: any, data: any) => {
          if (docRef.collectionName === "invoices" || docRef.path?.startsWith("invoices/")) {
            const current = inMemoryInvoices.get(docRef.id);
            if (current) {
              inMemoryInvoices.set(docRef.id, { ...current, ...data });
            }
          } else if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            const current = inMemoryOrders.get(docRef.id);
            if (current) {
              inMemoryOrders.set(docRef.id, { ...current, ...data });
            }
          }
        }),
      };
      await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 2) {
      return { collectionName: parts[0], id: parts[1], path: `${parts[0]}/${parts[1]}` };
    }
    if (parts.length === 4 && parts[0] === "orders" && parts[2] === "workflowHistory") {
      return { collectionName: "workflowHistory", orderId: parts[1], id: parts[3] || "mock-hist-id", path: `orders/${parts[1]}/workflowHistory/${parts[3] || "mock-hist-id"}` };
    }
    return { id: parts[parts.length - 1], path: parts.join("/") };
  }),
  collection: vi.fn((_db, ...parts) => ({
    path: parts.join("/"),
    withConverter: vi.fn((converter) => ({ converter, type: "collection" })),
  })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((...args) => ({ args })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => "2026-08-01T04:00:00.000Z"),
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => {
  const actualRepo = {
    getById: vi.fn(),
    validateSkipWindow: vi.fn((date, mealTypes, nowOverride) => {
      const now = nowOverride || new Date();
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);

      if (date < today) {
        throw new Error("Cannot modify skips for past dates.");
      }

      if (date === today) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "numeric",
          hourCycle: "h23",
        }).formatToParts(now);
        const hour = parseInt(
          parts.find((p) => p.type === "hour")?.value || "0",
          10,
        );
        const minute = parseInt(
          parts.find((p) => p.type === "minute")?.value || "0",
          10,
        );
        const currentTimeMinutes = hour * 60 + minute;

        for (const meal of mealTypes) {
          if (meal === "breakfast" && currentTimeMinutes >= 5 * 60) {
            throw new Error("Cancellation window has closed for breakfast.");
          }
          if (meal === "lunch" && currentTimeMinutes >= 10 * 60 + 30) {
            throw new Error("Cancellation window has closed for lunch.");
          }
          if (meal === "dinner" && currentTimeMinutes >= 16 * 60) {
            throw new Error("Cancellation window has closed for dinner.");
          }
        }
      }
    }),
  };
  return { subscriptionRepository: actualRepo };
});

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (uid: string) => {
      if (uid === "admin-1") return { id: "admin-1", role: "admin", fullName: "Admin User" };
      if (uid === "cust-1") return { id: "cust-1", role: "customer", fullName: "Customer 1" };
      if (uid === "cust-2") return { id: "cust-2", role: "customer", fullName: "Customer 2" };
      return null;
    }),
  },
}));

vi.mock("@/shared/services/firestore/accountsRepository", () => ({
  accountsRepository: {
    getInvoicesByCustomerId: vi.fn(async (customerId: string) => {
      return Array.from(inMemoryInvoices.values()).filter(
        (inv) => inv.customerId === customerId,
      );
    }),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(async (action, actorId, actorRole, actorName, entityId, entityType, details) => {
      inMemoryAuditLogs.push({ action, actorId, actorRole, actorName, entityId, entityType, details });
    }),
  },
}));

vi.mock("@/shared/services/firestore/deliveryZoneRepository", () => ({
  deliveryZoneRepository: {
    list: vi.fn(async () => [
      { id: "zone-1", name: "Zone 1", kitchenId: "kitchen-1" },
    ]),
  },
}));

import { orderService } from "../orderService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auth } from "@/shared/lib/firebase";

describe("Phase D.5 — addTodayAddon Business Operation & Verification Suite", () => {
  // Cutoff test timestamps in IST (UTC+05:30)
  const TIME_BREAKFAST_BEFORE = new Date("2026-08-01T04:59:00+05:30");
  const TIME_BREAKFAST_EXACT = new Date("2026-08-01T05:00:00+05:30");
  const TIME_BREAKFAST_AFTER = new Date("2026-08-01T05:01:00+05:30");

  const TIME_LUNCH_BEFORE = new Date("2026-08-01T10:29:00+05:30");
  const TIME_LUNCH_EXACT = new Date("2026-08-01T10:30:00+05:30");
  const TIME_LUNCH_AFTER = new Date("2026-08-01T10:31:00+05:30");

  const TIME_DINNER_BEFORE = new Date("2026-08-01T15:59:00+05:30");
  const TIME_DINNER_EXACT = new Date("2026-08-01T16:00:00+05:30");
  const TIME_DINNER_AFTER = new Date("2026-08-01T16:01:00+05:30");

  const baseSubscription: Subscription = {
    id: "sub-1",
    customerId: "cust-1",
    planId: "plan-1",
    planTier: "regular",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    quantity: 1,
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: null },
      { mealType: "lunch", selectedOptionId: null },
      { mealType: "dinner", selectedOptionId: null },
    ],
    zoneId: "zone-1",
    deliveryAddressId: "addr-1",
    billingCycle: "monthly",
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  } as unknown as Subscription;

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryOrders.clear();
    inMemoryInvoices.clear();
    inMemoryWorkflowHistory.clear();
    inMemoryAuditLogs.length = 0;
    txnQueue = Promise.resolve();

    (auth as any).currentUser = {
      uid: "cust-1",
      email: "cust1@example.com",
      displayName: "Customer 1",
    };

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({ ...baseSubscription });
  });

  // 1. Valid today add-on for lunch
  it("creates valid add-on order and updates invoice with line item", async () => {
    const res = await orderService.addTodayAddon(
      "sub-1",
      "lunch",
      "addon_paneer",
      1,
      TIME_LUNCH_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.alreadyExists).toBe(false);
    expect(res.addonId).toBe("addon_paneer");
    expect(res.addonName).toBe("Paneer Add-on");
    expect(res.unitPrice).toBe(40);
    expect(res.totalAmount).toBe(40);
    expect(res.quantity).toBe(1);

    // Verify persisted order
    const persistedOrder = inMemoryOrders.get(res.orderId);
    expect(persistedOrder).toBeDefined();
    expect(persistedOrder?.isAddon).toBe(true);
    expect(persistedOrder?.addonId).toBe("addon_paneer");
    expect(persistedOrder?.addonUnitPrice).toBe(40);
    expect(persistedOrder?.addonQuantity).toBe(1);
    expect(persistedOrder?.price).toBe(40);
    expect(persistedOrder?.status).toBe("scheduled");
    expect(persistedOrder?.kitchenId).toBe("kitchen-1");

    // Verify persisted invoice
    const persistedInvoice = inMemoryInvoices.get(res.invoiceId);
    expect(persistedInvoice).toBeDefined();
    expect(persistedInvoice?.totalAmount).toBe(40);
    expect(persistedInvoice?.subtotal).toBe(40);
    expect(persistedInvoice?.lineItems.length).toBe(1);

    const line = persistedInvoice?.lineItems[0];
    expect(line?.addonId).toBe("addon_paneer");
    expect(line?.quantity).toBe(1);
    expect(line?.unitPrice).toBe(40);
    expect(line?.amount).toBe(40);
    expect(line?.mealType).toBe("lunch");
    expect(line?.orderId).toBe(res.orderId);
  });

  // 2. Cutoff checks: Breakfast, Lunch, Dinner before cutoff
  it("succeeds before cutoff for breakfast and dinner add-ons", async () => {
    // Breakfast add-on: addon_vada (₹25)
    const resB = await orderService.addTodayAddon(
      "sub-1",
      "breakfast",
      "addon_vada",
      2,
      TIME_BREAKFAST_BEFORE,
    );
    expect(resB.success).toBe(true);
    expect(resB.unitPrice).toBe(25);
    expect(resB.totalAmount).toBe(50);

    // Dinner add-on: addon_curd (₹20)
    const resD = await orderService.addTodayAddon(
      "sub-1",
      "dinner",
      "addon_curd",
      1,
      TIME_DINNER_BEFORE,
    );
    expect(resD.success).toBe(true);
    expect(resD.unitPrice).toBe(20);
    expect(resD.totalAmount).toBe(20);
  });

  // 3. Exact cutoff time is strictly rejected
  it("rejects exact cutoff time for breakfast, lunch, and dinner", async () => {
    await expect(
      orderService.addTodayAddon("sub-1", "breakfast", "addon_vada", 1, TIME_BREAKFAST_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for breakfast/);

    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);

    await expect(
      orderService.addTodayAddon("sub-1", "dinner", "addon_paneer", 1, TIME_DINNER_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
  });

  // 4. After cutoff is strictly rejected
  it("rejects requests after cutoff", async () => {
    await expect(
      orderService.addTodayAddon("sub-1", "breakfast", "addon_vada", 1, TIME_BREAKFAST_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for breakfast/);

    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);

    await expect(
      orderService.addTodayAddon("sub-1", "dinner", "addon_paneer", 1, TIME_DINNER_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
  });

  // 5. Invalid / inactive add-on
  it("rejects non-existent add-on id", async () => {
    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "non_existent_addon", 1, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/Add-on non_existent_addon not found/);
  });

  // 6. Invalid meal slot for add-on
  it("rejects add-on not valid for requested meal slot", async () => {
    // addon_vada is only for breakfast
    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_vada", 1, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/not available for lunch/);

    // addon_paneer is for lunch/dinner, not breakfast
    await expect(
      orderService.addTodayAddon("sub-1", "breakfast", "addon_paneer", 1, TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/not available for breakfast/);
  });

  // 7. Invalid quantity
  it("rejects quantity <= 0 or non-integer", async () => {
    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 0, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/Quantity must be a positive integer/);

    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", -2, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/Quantity must be a positive integer/);

    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1.5, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/Quantity must be a positive integer/);
  });

  // 8. Ownership verification
  it("rejects non-owner customer with Unauthorized", async () => {
    (auth as any).currentUser = { uid: "cust-2", email: "cust2@example.com" };
    await expect(
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("allows admin user to add add-on for customer subscription", async () => {
    (auth as any).currentUser = { uid: "admin-1", email: "admin@example.com" };
    const res = await orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE);
    expect(res.success).toBe(true);
    expect(res.totalAmount).toBe(40);
  });

  // 9. Authoritative pricing calculation
  it("persists authoritative unit price and calculates total = unit price * quantity", async () => {
    const res = await orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 3, TIME_LUNCH_BEFORE);
    // Paneer is 40 -> 40 * 3 = 120
    expect(res.unitPrice).toBe(40);
    expect(res.totalAmount).toBe(120);

    const order = inMemoryOrders.get(res.orderId);
    expect(order?.price).toBe(120);
    expect(order?.addonUnitPrice).toBe(40);
    expect(order?.addonQuantity).toBe(3);

    const invoice = inMemoryInvoices.get(res.invoiceId);
    expect(invoice?.totalAmount).toBe(120);
  });

  // 10. Existing open invoice update
  it("adds line item to existing open invoice and increments total correctly", async () => {
    const existingInv: Invoice = {
      id: "inv_sub-1_2026-12-31",
      invoiceNumber: "INV-CUST-100001",
      customerId: "cust-1",
      subscriptionId: "sub-1",
      lineItems: [
        {
          description: "REGULAR Plan (monthly)",
          quantity: 1,
          unitPrice: 500,
          amount: 500,
        },
      ],
      subtotal: 500,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 500,
      depositHeld: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-08-01",
      billingPeriodEnd: "2026-08-31",
      dueDate: "2026-08-01",
      paidAt: null,
      paymentId: null,
      createdAt: new Date() as any,
    };
    inMemoryInvoices.set(existingInv.id, existingInv);

    const res = await orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 2, TIME_LUNCH_BEFORE);
    expect(res.invoiceId).toBe(existingInv.id);

    const updatedInv = inMemoryInvoices.get(existingInv.id);
    expect(updatedInv).toBeDefined();
    // 500 + 80 = 580
    expect(updatedInv?.totalAmount).toBe(580);
    expect(updatedInv?.subtotal).toBe(580);
    expect(updatedInv?.lineItems.length).toBe(2);
    expect(updatedInv?.lineItems[0].description).toBe("REGULAR Plan (monthly)");
    expect(updatedInv?.lineItems[1].addonId).toBe("addon_paneer");
    expect(updatedInv?.lineItems[1].amount).toBe(80);
  });

  // 11. Idempotency: duplicate request produces zero duplicate financial charge
  it("rejects duplicate identical add-on request without charging twice", async () => {
    const res1 = await orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE);
    expect(res1.alreadyExists).toBe(false);
    expect(res1.totalAmount).toBe(40);

    const invAfterFirst = inMemoryInvoices.get(res1.invoiceId);
    expect(invAfterFirst?.totalAmount).toBe(40);
    expect(invAfterFirst?.lineItems.length).toBe(1);

    // Second identical call
    const res2 = await orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE);
    expect(res2.alreadyExists).toBe(true);
    expect(res2.orderId).toBe(res1.orderId);

    // Invoice total and line items MUST NOT change!
    const invAfterSecond = inMemoryInvoices.get(res1.invoiceId);
    expect(invAfterSecond?.totalAmount).toBe(40);
    expect(invAfterSecond?.lineItems.length).toBe(1);
  });

  // 12. Concurrent requests produce exactly one charge
  it("concurrent add-on requests safely resolve to exactly one order and one billing charge", async () => {
    const [r1, r2] = await Promise.all([
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE),
      orderService.addTodayAddon("sub-1", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE),
    ]);

    expect(r1.orderId).toBe(r2.orderId);
    const newCreationCount = [!r1.alreadyExists, !r2.alreadyExists].filter(Boolean).length;
    expect(newCreationCount).toBe(1);

    const inv = inMemoryInvoices.get(r1.invoiceId);
    expect(inv?.totalAmount).toBe(40);
    expect(inv?.lineItems.length).toBe(1);
  });

  // 13. Sweet ₹35 authoritative add-on calculation and invoice attachment
  it("creates Sweet add-on order with authoritative unitPrice ₹35 and atomic invoice update (2x = ₹70)", async () => {
    const res = await orderService.addTodayAddon("sub-1", "lunch", "addon_sweet", 2, TIME_LUNCH_BEFORE);
    expect(res.success).toBe(true);
    expect(res.addonId).toBe("addon_sweet");
    expect(res.addonName).toBe("Gulab Jamun (2 pcs)");
    expect(res.quantity).toBe(2);
    expect(res.unitPrice).toBe(35);
    expect(res.totalAmount).toBe(70);

    const persistedOrder = inMemoryOrders.get(res.orderId);
    expect(persistedOrder).toBeDefined();
    expect(persistedOrder?.addonUnitPrice).toBe(35);
    expect(persistedOrder?.price).toBe(70);
    expect(persistedOrder?.addonQuantity).toBe(2);

    const inv = inMemoryInvoices.get(res.invoiceId);
    expect(inv).toBeDefined();
    expect(inv?.totalAmount).toBe(70);
    const sweetLine = inv?.lineItems.find((li) => li.addonId === "addon_sweet");
    expect(sweetLine).toBeDefined();
    expect(sweetLine?.unitPrice).toBe(35);
    expect(sweetLine?.amount).toBe(70);
    expect(sweetLine?.quantity).toBe(2);
  });

  // 14. Authoritative catalog integrity: all AVAILABLE_ADDONS calculate exact prices without client trust
  it("verifies all items in AVAILABLE_ADDONS compute authoritative prices via pricingService", async () => {
    const { AVAILABLE_ADDONS, pricingService } = await import("@/shared/services/business/pricingService");
    expect(AVAILABLE_ADDONS.length).toBeGreaterThanOrEqual(6);

    for (const addon of AVAILABLE_ADDONS) {
      expect(addon.unitPrice).toBe(addon.price);
      expect(addon.unitPrice).toBeGreaterThan(0);

      const single = pricingService.calculateAddonPrice(addon.id, 1);
      expect(single.unitPrice).toBe(addon.unitPrice);
      expect(single.total).toBe(addon.unitPrice);

      const double = pricingService.calculateAddonPrice(addon.id, 2);
      expect(double.total).toBe(addon.unitPrice * 2);
    }
  });
});
