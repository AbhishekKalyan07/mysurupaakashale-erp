import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription, Invoice } from "@/shared/types";
import { addonRepository, INITIAL_ADDONS } from "@/shared/services/firestore/addonRepository";
import { pricingService } from "@/shared/services/business/pricingService";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryInvoices: Map<string, Invoice> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemoryAuditLogs: any[] = [];
const inMemoryAddonDocs: Map<string, any> = new Map();

// Mock Firebase Auth & DB
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
          if (docRef.collectionName === "addons" || docRef.path?.startsWith("addons/")) {
            const addon = inMemoryAddonDocs.get(docRef.id);
            return {
              exists: () => !!addon,
              data: () => (addon ? { ...addon } : undefined),
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
          } else if (docRef.collectionName === "addons" || docRef.path?.startsWith("addons/")) {
            inMemoryAddonDocs.set(docRef.id, { ...data, id: docRef.id });
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
          } else if (docRef.collectionName === "addons" || docRef.path?.startsWith("addons/")) {
            const current = inMemoryAddonDocs.get(docRef.id);
            if (current) {
              inMemoryAddonDocs.set(docRef.id, { ...current, ...data });
            }
          }
        }),
      };
      return await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 2) {
      return { collectionName: parts[0], id: parts[1], path: `${parts[0]}/${parts[1]}` };
    }
    if (parts.length === 4 && parts[0] === "orders" && parts[2] === "workflowHistory") {
      return {
        collectionName: "workflowHistory",
        orderId: parts[1],
        id: parts[3] || "mock-hist-id",
        path: `orders/${parts[1]}/workflowHistory/${parts[3] || "mock-hist-id"}`,
      };
    }
    return { id: parts[parts.length - 1], path: parts.join("/") };
  }),
  collection: vi.fn((_db, ...parts) => ({
    path: parts.join("/"),
    withConverter: vi.fn((converter) => ({ converter, type: "collection" })),
  })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((...args) => ({ args })),
  getDoc: vi.fn(async (docRef: any) => {
    const id = docRef.id;
    const doc = inMemoryAddonDocs.get(id);
    return {
      id,
      exists: () => !!doc,
      data: () => (doc ? { ...doc } : undefined),
    };
  }),
  getDocs: vi.fn(async () => {
    const docs = Array.from(inMemoryAddonDocs.values()).map((d) => ({
      id: d.id,
      data: () => ({ ...d }),
    }));
    return { docs };
  }),
  setDoc: vi.fn(async (docRef: any, data: any) => {
    inMemoryAddonDocs.set(docRef.id, { ...data, id: docRef.id });
  }),
  updateDoc: vi.fn(async (docRef: any, data: any) => {
    const existing = inMemoryAddonDocs.get(docRef.id) || {};
    inMemoryAddonDocs.set(docRef.id, { ...existing, ...data });
  }),
  serverTimestamp: vi.fn(() => "2026-09-29T10:00:00.000Z"),
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getById: vi.fn(),
    validateSkipWindow: vi.fn((_date, mealTypes, nowOverride) => {
      const now = nowOverride || new Date();
      const cutoffMap: Record<string, string> = {
        breakfast: "05:00",
        lunch: "10:30",
        dinner: "16:00",
      };
      const valid = mealTypes.every((mt: string) => {
        const [h, m] = (cutoffMap[mt] || "05:00").split(":").map(Number);
        const cutoff = new Date(now);
        cutoff.setHours(h, m, 0, 0);
        return now.getTime() < cutoff.getTime();
      });
      return { valid, errors: valid ? [] : ["Cutoff time has passed"] };
    }),
  },
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (uid: string) => {
      if (uid === "admin-1") return { id: "admin-1", role: "admin", fullName: "Admin User" };
      if (uid === "cust-1") return { id: "cust-1", role: "customer", fullName: "Customer 1" };
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

describe("Phase E4 — Authoritative Add-on Catalog & Order Pricing Suite", () => {
  const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const TIME_LUNCH_BEFORE = new Date(`${TODAY}T10:00:00+05:30`);
  const TIME_BREAKFAST_BEFORE = new Date(`${TODAY}T04:30:00+05:30`);
  const TIME_DINNER_BEFORE = new Date(`${TODAY}T15:30:00+05:30`);

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
    inMemoryAddonDocs.clear();
    txnQueue = Promise.resolve();

    // Populate initial addons in simulated db
    INITIAL_ADDONS.forEach((addon) => {
      inMemoryAddonDocs.set(addon.id, { ...addon });
    });

    // Reset repository in-memory cache to INITIAL_ADDONS
    (addonRepository as any).cachedAddons = INITIAL_ADDONS.map((a) => ({ ...a }));

    (auth as any).currentUser = {
      uid: "cust-1",
      email: "cust1@example.com",
      displayName: "Customer 1",
    };

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({ ...baseSubscription });
  });

  // A. Admin can create add-on
  it("A. Admin can create a new add-on with meal slots, price and audit log", async () => {
    const newAddon = await addonRepository.createAddon(
      {
        name: "Masala Buttermilk",
        price: 25,
        mealTypes: ["lunch", "dinner"],
        description: "Refreshing spiced buttermilk",
        isActive: true,
      },
      "admin-1",
      "admin",
    );

    expect(newAddon.id).toBeDefined();
    expect(newAddon.name).toBe("Masala Buttermilk");
    expect(newAddon.price).toBe(25);
    expect(newAddon.applicableMealTypes).toEqual(["lunch", "dinner"]);
    expect(newAddon.isActive).toBe(true);

    // Verify audit log
    const audit = inMemoryAuditLogs.find((l) => l.action === "addon_created");
    expect(audit).toBeDefined();
    expect(audit.actorId).toBe("admin-1");
    expect(audit.details.name).toBe("Masala Buttermilk");
    expect(audit.details.price).toBe(25);

    // Verify catalog lookup returns newly created addon
    const fetched = await addonRepository.getById(newAddon.id);
    expect(fetched?.name).toBe("Masala Buttermilk");
  });

  // B. Admin can edit add-on
  it("B. Admin can edit an existing add-on and updates audit log", async () => {
    const updated = await addonRepository.updateAddon(
      "addon_curd",
      { price: 25, name: "Fresh Thick Curd" },
      "admin-1",
      "admin",
    );

    expect(updated.price).toBe(25);
    expect(updated.name).toBe("Fresh Thick Curd");

    const audit = inMemoryAuditLogs.find((l) => l.action === "addon_updated");
    expect(audit).toBeDefined();
    expect(audit.details.addonId).toBe("addon_curd");
    expect(audit.details.newValues.price).toBe(25);

    // Verify PricingService reflects the updated price
    const resolved = await pricingService.getAddonByIdAsync("addon_curd");
    expect(resolved?.price).toBe(25);
  });

  // C. Admin can disable add-on
  it("C. Admin can disable an add-on and toggleStatus creates addon_disabled audit log", async () => {
    const disabled = await addonRepository.toggleStatus("addon_kesaribath", false, "admin-1", "admin");
    expect(disabled.isActive).toBe(false);

    const audit = inMemoryAuditLogs.find((l) => l.action === "addon_disabled");
    expect(audit).toBeDefined();
    expect(audit.details.addonId).toBe("addon_kesaribath");

    const available = await pricingService.getAvailableAddonsAsync("breakfast");
    expect(available.some((a) => a.id === "addon_kesaribath")).toBe(false);
  });

  // D. Disabled add-on cannot be added to a new order
  it("D. Disabled add-on cannot be added to a new order via addTodayAddon", async () => {
    // Disable addon_kesaribath
    await addonRepository.toggleStatus("addon_kesaribath", false, "admin-1", "admin");

    await expect(
      orderService.addTodayAddon("sub-1", "breakfast", "addon_kesaribath", 1, TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/(?:inactive|unavailable)/i);
  });

  // E. Allowed meal type is enforced
  it("E. Allowed meal type is strictly enforced (e.g. curd lunch/dinner rejected for breakfast)", async () => {
    // addon_curd is only allowed for lunch & dinner
    await expect(
      orderService.addTodayAddon("sub-1", "breakfast", "addon_curd", 1, TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/not available for breakfast/i);
  });

  // F, G, H: Catalog price change does NOT mutate existing order; new order picks up new price
  it("F, G, H. Catalog price change keeps existing order price frozen; new order uses new catalog price", async () => {
    // Step 1: Customer creates add-on order at initial price (addon_curd = 20)
    const initialOrderRes = await orderService.addTodayAddon(
      "sub-1",
      "lunch",
      "addon_curd",
      1,
      TIME_LUNCH_BEFORE,
    );

    expect(initialOrderRes.unitPrice).toBe(20);
    expect(initialOrderRes.totalAmount).toBe(20);

    const existingOrder = inMemoryOrders.get(initialOrderRes.orderId);
    expect(existingOrder?.addonUnitPrice).toBe(20);
    expect(existingOrder?.price).toBe(20);

    // Step 2: Admin increases catalog price to 30
    await addonRepository.updateAddon("addon_curd", { price: 30 }, "admin-1", "admin");

    // F & G: Verify the existing order remains untouched at ₹20
    const existingOrderAfterCatalogChange = inMemoryOrders.get(initialOrderRes.orderId);
    expect(existingOrderAfterCatalogChange?.addonUnitPrice).toBe(20);
    expect(existingOrderAfterCatalogChange?.price).toBe(20);
    expect(existingOrderAfterCatalogChange?.status).toBe("scheduled");

    // H: New add-on order for dinner picks up the new price ₹30
    const newOrderRes = await orderService.addTodayAddon(
      "sub-1",
      "dinner",
      "addon_curd",
      1,
      TIME_DINNER_BEFORE,
    );

    expect(newOrderRes.unitPrice).toBe(30);
    expect(newOrderRes.totalAmount).toBe(30);

    const newOrder = inMemoryOrders.get(newOrderRes.orderId);
    expect(newOrder?.addonUnitPrice).toBe(30);
    expect(newOrder?.price).toBe(30);
  });

  // I. Quantity calculation remains correct
  it("I. Quantity calculation correctly multiplies unit price", async () => {
    const res = await orderService.addTodayAddon(
      "sub-1",
      "lunch",
      "addon_paneer",
      3,
      TIME_LUNCH_BEFORE,
    );

    expect(res.quantity).toBe(3);
    expect(res.unitPrice).toBe(40);
    expect(res.totalAmount).toBe(120);

    const order = inMemoryOrders.get(res.orderId);
    expect(order?.addonQuantity).toBe(3);
    expect(order?.price).toBe(120);
  });

  // J, K. Invoice line uses frozen add-on price and historical invoice remains unchanged
  it("J, K. Invoice line uses frozen price and historical invoice is unaffected by catalog price change", async () => {
    // 1. Create add-on order (addon_chapati unit price is 25 in initial catalog)
    const orderRes = await orderService.addTodayAddon(
      "sub-1",
      "lunch",
      "addon_chapati",
      2,
      TIME_LUNCH_BEFORE,
    );

    expect(orderRes.totalAmount).toBe(50); // 2 * 25

    // Check invoice line
    const invoiceList = Array.from(inMemoryInvoices.values());
    expect(invoiceList).toHaveLength(1);
    const invoice = invoiceList[0];
    const addonLine = invoice.lineItems.find((li) => li.orderId === orderRes.orderId);
    expect(addonLine).toBeDefined();
    expect(addonLine?.unitPrice).toBe(25);
    expect(addonLine?.quantity).toBe(2);
    expect(addonLine?.amount).toBe(50);
    const initialInvoiceTotal = invoice.totalAmount;

    // 2. Admin raises chapati price to ₹30
    await addonRepository.updateAddon("addon_chapati", { price: 30 }, "admin-1", "admin");

    // 3. Historical invoice line and total remain frozen
    const reloadedInvoice = inMemoryInvoices.get(invoice.id);
    const reloadedLine = reloadedInvoice?.lineItems.find((li) => li.orderId === orderRes.orderId);
    expect(reloadedLine?.unitPrice).toBe(25);
    expect(reloadedLine?.amount).toBe(50);
    expect(reloadedInvoice?.totalAmount).toBe(initialInvoiceTotal);
  });

  // P. Customer addTodayAddon still works
  it("P. Customer addTodayAddon creates order snapshot and couples with invoice", async () => {
    (auth as any).currentUser = {
      uid: "cust-1",
      email: "cust1@example.com",
      displayName: "Customer 1",
    };

    const res = await orderService.addTodayAddon(
      "sub-1",
      "lunch",
      "addon_sweet",
      1,
      TIME_LUNCH_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.addonId).toBe("addon_sweet");
    expect(res.unitPrice).toBe(35);
  });

  // Q. Admin call-center addTodayAddon still works
  it("Q. Admin call-center addTodayAddon works with authoritative catalog lookup", async () => {
    (auth as any).currentUser = {
      uid: "admin-1",
      email: "admin@mysuru.com",
      displayName: "Admin Operator",
    };

    const res = await orderService.addTodayAddon(
      "sub-1",
      "breakfast",
      "addon_vada",
      2,
      TIME_BREAKFAST_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.addonId).toBe("addon_vada");
    expect(res.quantity).toBe(2);
    expect(res.unitPrice).toBe(25);
    expect(res.totalAmount).toBe(50);
  });

  // R. Existing D5 cancellation behavior is not broken
  it("R. Cancellation and credit calculation behavior remain intact", async () => {
    // 1. Verify pricingService calculates standard cancellation amounts correctly
    const cancelAmt = pricingService.calculateCancellationAmount(
      baseSubscription,
      ["lunch"],
    );
    expect(cancelAmt).toBeGreaterThan(0);

    // 2. Cancellation of multiple meals sums up correctly
    const multiCancelAmt = pricingService.calculateCancellationAmount(
      baseSubscription,
      ["breakfast", "lunch"],
    );
    expect(multiCancelAmt).toBeGreaterThan(cancelAmt);
  });
});
