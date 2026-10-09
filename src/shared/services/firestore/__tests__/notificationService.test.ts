import { describe, it, expect, vi, beforeEach } from "vitest";
import * as notificationService from "../notificationService";
import { notificationRepository } from "../notificationRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";

vi.mock("../notificationRepository", () => ({
  notificationRepository: {
    createNotification: vi.fn(),
    createBatch: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    list: vi.fn(),
  },
}));

vi.mock("@/shared/lib/firebase", () => ({
  auth: {
    currentUser: { uid: "test-admin-uid" },
  },
}));

describe("notificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Subscription Notifications", () => {
    it("notifySubscriptionCreated", async () => {
      await notificationService.notifySubscriptionCreated(
        "cust-1",
        "sub-1",
        "Premium",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "cust-1",
          recipientRole: "customer",
          type: "subscription_created",
          relatedEntityType: "subscription",
          relatedEntityId: "sub-1",
          priority: "normal",
        }),
      );
    });

    it("notifySubscriptionActivated", async () => {
      await notificationService.notifySubscriptionActivated(
        "cust-1",
        "sub-1",
        "Premium",
        "2026-08-01",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "cust-1",
          type: "subscription_activated",
          priority: "high",
        }),
      );
    });

    it("notifySubscriptionRenewalReminder - high urgency", async () => {
      await notificationService.notifySubscriptionRenewalReminder(
        "cust-1",
        "sub-1",
        1,
        "2026-08-02",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "subscription_renewal_reminder",
          priority: "high",
        }),
      );
    });

    it("notifySubscriptionRenewalReminder - normal urgency", async () => {
      await notificationService.notifySubscriptionRenewalReminder(
        "cust-1",
        "sub-1",
        3,
        "2026-08-05",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "normal" }),
      );
    });

    it("notifySubscriptionRenewalReminder - low urgency", async () => {
      await notificationService.notifySubscriptionRenewalReminder(
        "cust-1",
        "sub-1",
        5,
        "2026-08-07",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "low" }),
      );
    });

    it("notifySubscriptionExpired", async () => {
      await notificationService.notifySubscriptionExpired("cust-1", "sub-1");
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: "high",
          type: "subscription_renewal_reminder",
        }),
      );
    });

    it("notifySubscriptionPaused", async () => {
      await notificationService.notifySubscriptionPaused("cust-1", "sub-1");
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "subscription_paused" }),
      );
    });

    it("notifySubscriptionResumed", async () => {
      await notificationService.notifySubscriptionResumed("cust-1", "sub-1");
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "subscription_resumed",
          priority: "high",
        }),
      );
    });

    it("notifySubscriptionRejected with reason", async () => {
      await notificationService.notifySubscriptionRejected(
        "cust-1",
        "sub-1",
        "Invalid area",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "subscription_cancelled",
          message: expect.stringContaining("Invalid area"),
        }),
      );
    });

    it("notifySubscriptionRejected without reason", async () => {
      await notificationService.notifySubscriptionRejected("cust-1", "sub-1");
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "subscription_cancelled",
          message: expect.stringContaining("couldn't be approved"),
        }),
      );
    });
  });

  describe("Payment Notifications", () => {
    it("notifyPaymentSubmitted notifies customer and admins", async () => {
      await notificationService.notifyPaymentSubmitted(
        "cust-1",
        "John Doe (C123)",
        "pay-1",
        1500,
        ["admin-1", "admin-2"],
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledTimes(
        3,
      );
      // Customer notification
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "cust-1",
          type: "payment_submitted",
        }),
      );
      // Admin notifications
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-1",
          recipientRole: "admin",
          type: "payment_submitted",
          priority: "high",
        }),
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-2",
          recipientRole: "admin",
          type: "payment_submitted",
          priority: "high",
        }),
      );
    });

    it("notifyPaymentVerified", async () => {
      await notificationService.notifyPaymentVerified("cust-1", "pay-1", 1500);
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "payment_verified", priority: "high" }),
      );
    });

    it("notifyPaymentReminder", async () => {
      await notificationService.notifyPaymentReminder(
        "cust-1",
        1500,
        "2026-08-05",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "payment_reminder", priority: "high" }),
      );
    });

    it("notifyInvoiceGenerated", async () => {
      await notificationService.notifyInvoiceGenerated(
        "cust-1",
        "inv-1",
        1500,
        "August 2026",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "invoice_generated",
          priority: "normal",
          relatedEntityId: "inv-1",
        }),
      );
    });

    it("notifyPaymentRejected with notes", async () => {
      await notificationService.notifyPaymentRejected(
        "cust-1",
        "pay-1",
        1500,
        "Blurry image",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "payment_rejected",
          message: expect.stringContaining("Blurry image"),
        }),
      );
    });

    it("notifyPaymentRejected without notes", async () => {
      await notificationService.notifyPaymentRejected(
        "cust-1",
        "pay-1",
        1500,
        null,
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "payment_rejected",
          message: expect.stringContaining(
            "resubmit with the correct reference",
          ),
        }),
      );
    });
  });

  describe("Delivery Notifications", () => {
    it("notifyDriverAssigned", async () => {
      await notificationService.notifyDriverAssigned(
        "cust-1",
        "ord-1",
        "Driver A",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "driver_assigned",
          relatedEntityId: "ord-1",
        }),
      );
    });

    it("notifyOrderOutForDelivery", async () => {
      await notificationService.notifyOrderOutForDelivery(
        "cust-1",
        "ord-1",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "out_for_delivery" }),
      );
    });

    it("notifyOrderDelivered", async () => {
      await notificationService.notifyOrderDelivered(
        "cust-1",
        "ord-1",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "delivered" }),
      );
    });

    it("notifyDeliveryFailed", async () => {
      await notificationService.notifyDeliveryFailed(
        "cust-1",
        "ord-1",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "delivery_failed", priority: "high" }),
      );
    });

    it("notifyOrderGeneratedCustomer", async () => {
      await notificationService.notifyOrderGeneratedCustomer(
        "cust-1",
        "lunch",
        "2026-08-01",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "system_alert",
          priority: "normal",
          recipientRole: "customer",
        }),
      );
    });

    it("notifyOrderGeneratedDriver", async () => {
      await notificationService.notifyOrderGeneratedDriver(
        "driver-1",
        "ord-1",
        "lunch",
        "Cust 1",
        "2026-08-01",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "system_alert",
          priority: "normal",
          recipientRole: "delivery",
        }),
      );
    });

    it("notifyReadyForPickup", async () => {
      await notificationService.notifyReadyForPickup(
        "driver-1",
        "ord-1",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "system_alert",
          priority: "high",
          recipientRole: "delivery",
        }),
      );
    });

    it("notifyAccountsDelivered", async () => {
      await notificationService.notifyAccountsDelivered(
        "account-1",
        "ord-1",
        "lunch",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "system_alert",
          priority: "normal",
          recipientRole: "accounts",
        }),
      );
    });
  });

  describe("Kitchen / Operations Notifications", () => {
    it("notifyDailyOrdersGenerated notifies multiple staff", async () => {
      await notificationService.notifyDailyOrdersGenerated(
        ["k-1", "k-2"],
        "2026-08-02",
        150,
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledTimes(
        2,
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "k-1",
          recipientRole: "kitchen",
          type: "daily_orders_generated",
          priority: "high",
        }),
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "k-2",
          recipientRole: "kitchen",
          type: "daily_orders_generated",
          priority: "high",
        }),
      );
    });
  });

  describe("Staff / Admin Notifications", () => {
    it("notifyStaffAccountCreated", async () => {
      await notificationService.notifyStaffAccountCreated(
        "staff-1",
        "kitchen",
        "John Doe",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "staff-1",
          recipientRole: "kitchen",
          type: "staff_account_created",
          priority: "high",
        }),
      );
    });

    it("notifyAdminAlert notifies multiple admins", async () => {
      await notificationService.notifyAdminAlert(
        ["admin-1", "admin-2"],
        "Alert",
        "Message",
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-1",
          recipientRole: "admin",
          type: "system_alert",
        }),
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-2",
          recipientRole: "admin",
          type: "system_alert",
        }),
      );
    });
  });

  describe("Admin Broadcast Notifications", () => {
    it("sends to specific user directly", async () => {
      vi.mocked(notificationRepository.createNotification).mockResolvedValueOnce(
        "n-single",
      );

      const res = await notificationService.sendAdminBroadcastNotification({
        targetAudience: "specific_user",
        specificUserId: "user-target-1",
        specificUserRole: "customer",
        type: "system_alert",
        title: "Personal Alert",
        message: "Your delivery is delayed",
        priority: "high",
      });

      expect(res).toEqual({ success: true, recipientCount: 1 });
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "user-target-1",
          recipientRole: "customer",
          type: "system_alert",
          title: "Personal Alert",
          message: "Your delivery is delayed",
          priority: "high",
          createdBy: "test-admin-uid",
        }),
      );
    });

    it("broadcasts to all active customers via createBatch", async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([
        { id: "c1", role: "customer", isActive: true } as any,
        { id: "c2", role: "customer", isActive: false } as any, // inactive - should filter out
        { id: "k1", role: "kitchen", isActive: true } as any, // kitchen - should filter out
      ]);
      vi.mocked(notificationRepository.createBatch).mockResolvedValueOnce(1);

      const res = await notificationService.sendAdminBroadcastNotification({
        targetAudience: "customer",
        title: "Festival Menu",
        message: "Special festive treats available!",
      });

      expect(res).toEqual({ success: true, recipientCount: 1 });
      expect(notificationRepository.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            recipientId: "c1",
            recipientRole: "customer",
            title: "Festival Menu",
            createdBy: "test-admin-uid",
          }),
        ]),
      );
    });

    it("broadcasts to staff members (admin, kitchen, delivery_partner, accounts)", async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([
        { id: "k1", role: "kitchen", isActive: true } as any,
        { id: "d1", role: "delivery_partner", isActive: true } as any,
        { id: "c1", role: "customer", isActive: true } as any, // customer - excluded from staff
      ]);
      vi.mocked(notificationRepository.createBatch).mockResolvedValueOnce(2);

      const res = await notificationService.sendAdminBroadcastNotification({
        targetAudience: "staff",
        title: "Staff Meeting",
        message: "Briefing at 4 PM",
      });

      expect(res).toEqual({ success: true, recipientCount: 2 });
      expect(notificationRepository.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ recipientId: "k1", recipientRole: "kitchen" }),
          expect.objectContaining({
            recipientId: "d1",
            recipientRole: "delivery_partner",
          }),
        ]),
      );
    });

    it("handles 0 matching recipients cleanly without error", async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([]);

      const res = await notificationService.sendAdminBroadcastNotification({
        targetAudience: "delivery_partner",
        title: "Driver Notice",
        message: "Rain forecast",
      });

      expect(res).toEqual({ success: true, recipientCount: 0 });
      expect(notificationRepository.createBatch).not.toHaveBeenCalled();
    });
  });

  describe("Operational Cancellation Notifications", () => {
    const mockOrder = {
      id: "ord_101",
      customerName: "Ramesh Kumar",
      displayId: "MP-042",
      mealType: "lunch",
      date: "2026-08-01",
      deliveryPartnerId: "driver-88",
      operatorId: "kitchen-55",
    };

    it("notifyMealCancelledToDriver sends formatted alert to assigned driver", async () => {
      await notificationService.notifyMealCancelledToDriver(
        "driver-88",
        mockOrder,
        "Customer skipped lunch",
      );

      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "driver-88",
          recipientRole: "delivery_partner",
          type: "meal_cancelled",
          title: "Meal Cancelled: Lunch",
          message: expect.stringContaining("Ramesh Kumar (MP-042)'s Lunch for today (2026-08-01) has been cancelled. Reason: Customer skipped lunch"),
          priority: "high",
          relatedEntityType: "order",
          relatedEntityId: "ord_101",
          metadata: expect.objectContaining({
            orderId: "ord_101",
            date: "2026-08-01",
            mealType: "lunch",
          }),
        }),
      );
    });

    it("notifyMealCancelledToKitchen sends formatted alert to kitchen operator", async () => {
      await notificationService.notifyMealCancelledToKitchen(
        "kitchen-55",
        mockOrder,
        "Customer request",
      );

      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "kitchen-55",
          recipientRole: "kitchen",
          type: "meal_cancelled",
          title: "Meal Cancelled: Lunch",
          message: expect.stringContaining("Ramesh Kumar (MP-042)'s Lunch for today (2026-08-01) has been cancelled"),
          priority: "high",
          relatedEntityType: "order",
          relatedEntityId: "ord_101",
        }),
      );
    });

    it("notifyMealCancelledToAdmin sends formatted alert to admin", async () => {
      await notificationService.notifyMealCancelledToAdmin(
        "admin-1",
        mockOrder,
        "Customer request",
      );

      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-1",
          recipientRole: "admin",
          type: "meal_cancelled",
          title: "Meal Cancelled: Lunch",
          priority: "normal",
          relatedEntityType: "order",
          relatedEntityId: "ord_101",
        }),
      );
    });

    it("dispatchOperationalCancellationNotifications notifies driver, kitchen, and admins for today's orders in IST", async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([
        { id: "admin-1", role: "admin", isActive: true } as any,
      ]);

      const now = new Date("2026-08-01T09:00:00+05:30");
      await notificationService.dispatchOperationalCancellationNotifications(
        [mockOrder],
        "Customer skipped lunch",
        { uid: "c1", role: "customer" },
        now,
      );

      // Driver notified
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "driver-88",
          type: "meal_cancelled",
        }),
      );

      // Kitchen operator notified
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "kitchen-55",
          type: "meal_cancelled",
        }),
      );

      // Admin notified
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "admin-1",
          type: "meal_cancelled",
        }),
      );
    });

    it("dispatchOperationalCancellationNotifications ignores future-dated orders", async () => {
      const futureOrder = {
        ...mockOrder,
        date: "2026-08-10",
      };

      const now = new Date("2026-08-01T09:00:00+05:30");
      await notificationService.dispatchOperationalCancellationNotifications(
        [futureOrder],
        "Future skip",
        { uid: "c1", role: "customer" },
        now,
      );

      // No notifications sent for future-dated orders
      expect(notificationRepository.createNotification).not.toHaveBeenCalled();
    });

    it("dispatchOperationalCancellationNotifications safely handles missing staff assignments", async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([]);

      const unassignedOrder = {
        ...mockOrder,
        deliveryPartnerId: null,
        operatorId: null,
      };

      const now = new Date("2026-08-01T09:00:00+05:30");
      await expect(
        notificationService.dispatchOperationalCancellationNotifications(
          [unassignedOrder],
          "Cancelled",
          { uid: "c1", role: "customer" },
          now,
        ),
      ).resolves.not.toThrow();

      // No driver or kitchen notification sent because none were assigned
      expect(notificationRepository.createNotification).not.toHaveBeenCalled();
    });
  });

  describe("Error handling (Fire and Forget boundary test)", () => {
    it("surfaces repository errors (since service does not swallow them locally)", async () => {
      vi.mocked(
        notificationRepository.createNotification,
      ).mockRejectedValueOnce(new Error("DB Error"));
      await expect(
        notificationService.notifySubscriptionCreated(
          "cust-1",
          "sub-1",
          "Premium",
        ),
      ).rejects.toThrow("DB Error");
    });
  });
});
