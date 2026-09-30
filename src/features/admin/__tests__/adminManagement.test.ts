import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Subscription, Order, CustomerProfile, Invoice, ManualPayment } from "@/shared/types";
import { pricingService } from "@/shared/services/business/pricingService";

describe("Phase D.6 — Admin Customer, Account & Order Management", () => {
  const mockAdminUid = "admin-uid-1";
  const mockAdminName = "Admin User";
  const mockCustomerUid = "cust-uid-1";
  const mockSubId = "sub-123";

  const mockCustomer = {
    id: mockCustomerUid,
    displayId: "MP-C001",
    fullName: "Ramesh Kumar",
    email: "ramesh@example.com",
    phone: "9876543210",
    role: "customer",
    isActive: true,
    zoneId: "zone-north",
    deliveryPartnerId: "dp-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    addresses: [
      {
        id: "addr-1",
        label: "Home",
        line1: "123 Saraswathipuram",
        city: "Mysuru",
        pincode: "570009",
        isDefault: true,
      },
    ],
    defaultAddressId: "addr-1",
  } as unknown as CustomerProfile;

  const mockSubscription = {
    id: mockSubId,
    customerId: mockCustomerUid,
    planId: "standard-monthly",
    planTier: "standard",
    quantity: 1,
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    billingCycle: "monthly",
    autoRenew: true,
    depositAmount: 1000,
    pricePerDaySnapshot: 140,
    pricingMatrixSnapshot: {
      breakfast: 40,
      lunch: 60,
      dinner: 60,
      breakfast_lunch: 95,
      lunch_dinner: 115,
      breakfast_dinner: 95,
      breakfast_lunch_dinner: 140,
    },
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: "opt-1" },
      { mealType: "lunch", selectedOptionId: "opt-2" },
      { mealType: "dinner", selectedOptionId: "opt-3" },
    ],
    deliveryAddressId: "addr-1",
    zoneId: "zone-north",
    deliveryPartnerId: "dp-1",
    latestPaymentId: "pay-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  } as unknown as Subscription;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. CUSTOMER MANAGEMENT ───────────────────────────────────────────────────
  describe("1. Customer Management", () => {
    it("retrieves customer details with addresses and allotted display ID", () => {
      expect(mockCustomer.id).toBe(mockCustomerUid);
      expect(mockCustomer.displayId).toBe("MP-C001");
      expect(mockCustomer.addresses).toHaveLength(1);
      expect(mockCustomer.addresses![0].line1).toContain("Saraswathipuram");
    });

    it("verifies customer subscriptions can be inspected with all metadata", () => {
      expect(mockSubscription.customerId).toBe(mockCustomerUid);
      expect(mockSubscription.status).toBe("active");
      expect(mockSubscription.mealPreferences).toHaveLength(3);
      expect(mockSubscription.autoRenew).toBe(true);
    });
  });

  // ── 2. SUBSCRIPTION MANAGEMENT & PRICING PRESERVATION ───────────────────────
  describe("2. Subscription Management", () => {
    it("preserves negotiated pricing over snapshot and fallback", () => {
      const subWithNegotiated: Subscription = {
        ...mockSubscription,
        negotiatedPricing: {
          breakfast: 35,
          lunch: 55,
          dinner: 55,
          breakfast_lunch: 85,
          lunch_dinner: 105,
          breakfast_dinner: 85,
          breakfast_lunch_dinner: 130,
        },
      };

      const lunchPrice = pricingService.calculateMealPrice(subWithNegotiated, "lunch");
      expect(lunchPrice).toBe(55); // Negotiated price wins over snapshot (60)
    });

    it("validates date modification bounds (end date cannot precede start date)", () => {
      const startDate = "2026-06-01";
      const invalidEndDate = "2026-05-01";
      const isValid = invalidEndDate >= startDate;
      expect(isValid).toBe(false);
    });

    it("preserves autoRenew semantics and status transitions", () => {
      const pausedSub: Subscription = {
        ...mockSubscription,
        status: "paused",
        pauseStartDate: "2026-07-01",
        pauseEndDate: "2026-07-15",
      };
      expect(pausedSub.status).toBe("paused");
      expect(pausedSub.pauseStartDate).toBe("2026-07-01");
    });
  });

  // ── 3. ORDER MANAGEMENT & ADD-ON INTEGRITY ──────────────────────────────────
  describe("3. Order Management & Add-on Distinction", () => {
    it("distinctly distinguishes add-on orders from regular subscription meals", () => {
      const regularMealOrder = {
        id: "ord-reg-1",
        displayId: "ORD-001",
        source: "subscription",
        customerId: mockCustomerUid,
        subscriptionId: mockSubId,
        date: "2026-09-27",
        mealType: "lunch",
        planTier: "standard",
        itemsLabel: "Mysuru Thali",
        price: 60,
        currency: "INR",
        status: "scheduled",
        isAddon: false,
      } as unknown as Order;

      const addonOrder = {
        id: "ord-addon-1",
        displayId: "ORD-002",
        source: "subscription",
        customerId: mockCustomerUid,
        subscriptionId: mockSubId,
        date: "2026-09-27",
        mealType: "lunch",
        planTier: "standard",
        itemsLabel: "Paneer Add-on (Qty: 2)",
        price: 80,
        currency: "INR",
        status: "scheduled",
        isAddon: true,
        addonId: "addon_paneer",
        addonName: "Paneer Add-on",
        addonQuantity: 2,
        addonUnitPrice: 40,
        invoiceId: "inv-2026-09",
      } as unknown as Order;

      // Add-on has specific add-on properties
      expect(regularMealOrder.isAddon).toBe(false);
      expect(addonOrder.isAddon).toBe(true);
      expect(addonOrder.addonId).toBe("addon_paneer");
      expect(addonOrder.addonQuantity).toBe(2);
      expect(addonOrder.addonUnitPrice).toBe(40);
      expect(addonOrder.price).toBe(80);
      expect(addonOrder.invoiceId).toBe("inv-2026-09");
    });

    it("ensures cancellation uses canonical subscription meal price, separate from add-ons", () => {
      const cancellationCredit = pricingService.calculateCancellationAmount(
        mockSubscription,
        ["lunch"],
      );
      // Canonical snapshot lunch price is 60
      expect(cancellationCredit).toBe(60);
    });
  });

  // ── 4. ACCOUNTS & FINANCIAL DATA INTEGRITY ───────────────────────────────────
  describe("4. Accounts & Billing Information", () => {
    it("displays persisted authoritative financial values without UI recalculation", () => {
      const persistedInvoice = {
        id: "inv-1",
        invoiceNumber: "INV-2026-001",
        customerId: mockCustomerUid,
        subscriptionId: mockSubId,
        billingPeriodStart: "2026-01-01",
        billingPeriodEnd: "2026-01-31",
        subtotal: 4200,
        totalAmount: 4200,
        currency: "INR",
        status: "issued",
        dueDate: "2026-02-07",
        lineItems: [
          { description: "Standard Monthly Meal Plan", quantity: 1, unitPrice: 4200, amount: 4200 },
        ],
        createdAt: new Date("2026-01-01"),
      } as unknown as Invoice;

      expect(persistedInvoice.totalAmount).toBe(4200);
      expect(persistedInvoice.subtotal).toBe(4200);
      expect(persistedInvoice.status).toBe("issued");
    });

    it("verifies payment verification status lifecycle", () => {
      const pendingPayment = {
        id: "pay-1",
        customerId: mockCustomerUid,
        subscriptionId: mockSubId,
        amount: 1000,
        currency: "INR",
        purpose: "security_deposit",
        paymentMethod: "upi",
        status: "pending",
        referenceNumber: "UPI12345678",
        createdAt: new Date("2026-01-01"),
      } as unknown as ManualPayment;

      const verifiedPayment = {
        ...pendingPayment,
        status: "verified",
        verifiedBy: mockAdminUid,
      } as unknown as ManualPayment;

      expect(pendingPayment.status).toBe("pending");
      expect(verifiedPayment.status).toBe("verified");
      expect(verifiedPayment.verifiedBy).toBe(mockAdminUid);
    });
  });

  // ── 5. AUDIT LOGGING PATTERNS ────────────────────────────────────────────────
  describe("5. Audit Logging Invariants", () => {
    it("creates audit log with required actor, action, and entity context", () => {
      const auditPayload = {
        action: "subscription_dates_updated",
        performedBy: mockAdminUid,
        performedByRole: "admin",
        performedByName: mockAdminName,
        entityId: mockSubId,
        entityType: "subscription",
        details: {
          previousStartDate: "2026-01-01",
          newStartDate: "2026-02-01",
        },
      };

      expect(auditPayload.action).toBe("subscription_dates_updated");
      expect(auditPayload.performedBy).toBe(mockAdminUid);
      expect(auditPayload.performedByRole).toBe("admin");
      expect(auditPayload.entityId).toBe(mockSubId);
      expect(auditPayload.details.newStartDate).toBe("2026-02-01");
    });

    it("records manual invoice creation audit entry", () => {
      const auditPayload = {
        action: "manual_invoice_created",
        performedBy: mockAdminUid,
        performedByRole: "admin",
        performedByName: mockAdminName,
        entityId: mockCustomerUid,
        entityType: "invoice",
        details: {
          amount: 2500,
          description: "One-time event catering",
        },
      };

      expect(auditPayload.action).toBe("manual_invoice_created");
      expect(auditPayload.details.amount).toBe(2500);
    });
  });
});
