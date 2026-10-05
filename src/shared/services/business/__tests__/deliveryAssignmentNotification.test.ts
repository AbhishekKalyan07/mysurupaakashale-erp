import { describe, it, expect } from "vitest";
import {
  formatDeliveryAssignmentAlertMessage,
  formatNotificationDate,
} from "../orderService";
import type { Order } from "@/shared/types";

describe("Delivery Assignment Notification Formatting", () => {
  describe("formatNotificationDate", () => {
    it("formats ISO date strings (YYYY-MM-DD) into d MMM yyyy", () => {
      expect(formatNotificationDate("2026-10-05")).toBe("5 Oct 2026");
      expect(formatNotificationDate("2026-01-15")).toBe("15 Jan 2026");
      expect(formatNotificationDate("2026-12-31")).toBe("31 Dec 2026");
    });

    it("handles undefined or empty date strings safely", () => {
      expect(formatNotificationDate(undefined)).toBe("");
      expect(formatNotificationDate("")).toBe("");
    });
  });

  describe("formatDeliveryAssignmentAlertMessage", () => {
    it("formats message with Customer Name, Display ID, Meal Type, and Date matching preferred format", () => {
      const order: Partial<Order> = {
        id: "ord_ce1001d8-9877-440a-b3e4-aeaf138812da_2026-10-05_lunch",
        subscriptionId: "ce1001d8-9877-440a-b3e4-aeaf138812da",
        customerId: "cust-user-1",
        customerName: "Rahul Kumar",
        customerCode: "MP-001",
        mealType: "lunch",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "lunch", "2026-10-05");

      expect(message).toBe(
        "Order for Rahul Kumar (MP-001) — Lunch on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("NEVER exposes raw internal order document ID or subscription UUID in notification", () => {
      const order: Partial<Order> = {
        id: "ord_ce1001d8-9877-440a-b3e4-aeaf138812da_2026-10-05_lunch",
        subscriptionId: "ce1001d8-9877-440a-b3e4-aeaf138812da",
        customerId: "cust-user-1",
        customerName: "Priya Rao",
        customerCode: "MP-105",
        mealType: "dinner",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "dinner", "2026-10-05");

      expect(message).not.toContain("ord_");
      expect(message).not.toContain("ce1001d8-9877-440a-b3e4-aeaf138812da");
      expect(message).not.toContain("ord_ce1001d8");
      expect(message).toBe(
        "Order for Priya Rao (MP-105) — Dinner on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("formats clean allotted ID fallback when customerCode is missing but customerId UID exists", () => {
      const order: Partial<Order> = {
        id: "ord_9dda7c83-f55c-48e5-978b-ed333c011028_2026-10-05_lunch",
        subscriptionId: "9dda7c83-f55c-48e5-978b-ed333c011028",
        customerId: "wtea9lQtgPVLLrrUEZVu58392019",
        customerName: "Amit Shah",
        mealType: "lunch",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "lunch", "2026-10-05");

      expect(message).toBe(
        "Order for Amit Shah (MP-WTEA9L) — Lunch on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
      expect(message).not.toContain("9dda7c83");
      expect(message).not.toContain("wtea9lQtgPVLLrrUEZVu58392019");
    });

    it("formats Customer (MP-xxx) when customerName is 'Unknown Customer' or missing", () => {
      const orderWithNameUnknown: Partial<Order> = {
        id: "ord_sub123_2026-10-05_breakfast",
        customerName: "Unknown Customer",
        customerCode: "MP-042",
        mealType: "breakfast",
        date: "2026-10-05",
      };

      const message1 = formatDeliveryAssignmentAlertMessage(orderWithNameUnknown, "breakfast", "2026-10-05");
      expect(message1).toBe(
        "Order for Customer (MP-042) — Breakfast on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );

      const orderWithoutName: Partial<Order> = {
        id: "ord_sub123_2026-10-05_breakfast",
        customerCode: "MP-042",
        mealType: "breakfast",
        date: "2026-10-05",
      };

      const message2 = formatDeliveryAssignmentAlertMessage(orderWithoutName, "breakfast", "2026-10-05");
      expect(message2).toBe(
        "Order for Customer (MP-042) — Breakfast on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("formats customerName only if display ID cannot be resolved", () => {
      const order: Partial<Order> = {
        id: "ord_sub123_2026-10-05_lunch",
        customerName: "Vikram Seth",
        mealType: "lunch",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "lunch", "2026-10-05");
      expect(message).toBe(
        "Order for Vikram Seth — Lunch on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("uses safe fallback when neither customerName nor customer display ID is available", () => {
      const order: Partial<Order> = {
        id: "ord_sub123_2026-10-05_lunch",
        mealType: "lunch",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "lunch", "2026-10-05");
      expect(message).toBe(
        "Order for Lunch on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
      expect(message).not.toContain("ord_");
      expect(message).not.toContain("sub123");
    });

    it("handles different meal types and capitalizes correctly", () => {
      const order: Partial<Order> = {
        customerName: "Kavitha M",
        customerCode: "MP-088",
        mealType: "dinner",
        date: "2026-10-07",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "dinner", "2026-10-07");
      expect(message).toBe(
        "Order for Kavitha M (MP-088) — Dinner on 7 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("uses order properties when mealType and dateStr arguments are omitted", () => {
      const order: Partial<Order> = {
        customerName: "Kavitha M",
        customerCode: "MP-088",
        mealType: "breakfast",
        date: "2026-10-08",
      };

      const message = formatDeliveryAssignmentAlertMessage(order);
      expect(message).toBe(
        "Order for Kavitha M (MP-088) — Breakfast on 8 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });

    it("falls back to formatted order displayId (ORD-xxxx) if customerCode and customerId are missing", () => {
      const order: Partial<Order> = {
        customerName: "Rahul Kumar",
        displayId: "ORD-9DDA7C",
        mealType: "lunch",
        date: "2026-10-05",
      };

      const message = formatDeliveryAssignmentAlertMessage(order, "lunch", "2026-10-05");
      expect(message).toBe(
        "Order for Rahul Kumar (ORD-9DDA7C) — Lunch on 5 Oct 2026 could not be automatically assigned. Please assign manually.",
      );
    });
  });
});
