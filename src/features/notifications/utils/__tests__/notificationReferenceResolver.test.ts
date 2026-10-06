import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatNotificationRecipientDisplay,
  resolveNotificationRecipients,
} from "../notificationReferenceResolver";
import type { Notification, UserProfile } from "@/shared/types";

// Mock Firestore
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  documentId: vi.fn(() => "__name__"),
  getDocs: vi.fn(),
  initializeFirestore: vi.fn(),
  getFirestore: vi.fn(),
  memoryLocalCache: vi.fn(),
  persistentSingleTabManager: vi.fn(),
  setLogLevel: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
}));

import { getDocs } from "firebase/firestore";

describe("notificationReferenceResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGetDocs = getDocs as any;

  describe("formatNotificationRecipientDisplay", () => {
    it("formats customer with full name and MP display ID", () => {
      const user: Partial<UserProfile> = {
        fullName: "Rahul Kumar",
        displayId: "MP-001",
        role: "customer",
      };
      expect(formatNotificationRecipientDisplay(user, "wtea9lQtgPVLLrrUEZVu")).toBe(
        "Rahul Kumar (MP-001)",
      );
    });

    it("formats customer with full name only", () => {
      const user: Partial<UserProfile> = {
        fullName: "Rahul Kumar",
        role: "customer",
      };
      // When displayId is missing, fallback uses formatAllottedId which gives MP-WTEA9L
      expect(formatNotificationRecipientDisplay(user, "wtea9lQtgPVLLrrUEZVu")).toBe(
        "Rahul Kumar (MP-WTEA9L)",
      );
    });

    it("formats fallback without user record without raw UID exposure", () => {
      const formatted = formatNotificationRecipientDisplay(null, "wtea9lQtgPVLLrrUEZVu58392019");
      expect(formatted).toBe("Customer (MP-WTEA9L)");
      expect(formatted).not.toContain("wtea9lQtgPVLLrrUEZVu58392019");
    });

    it("formats broadcast audience identifiers", () => {
      expect(formatNotificationRecipientDisplay(null, "all")).toBe("All Users");
      expect(formatNotificationRecipientDisplay(null, "customer")).toBe("All Customers");
      expect(formatNotificationRecipientDisplay(null, "delivery_partner")).toBe(
        "All Delivery Partners",
      );
      expect(formatNotificationRecipientDisplay(null, "kitchen")).toBe("Kitchen Staff");
      expect(formatNotificationRecipientDisplay(null, "staff")).toBe("All Staff");
    });
  });

  describe("resolveNotificationRecipients", () => {
    it("resolves broadcast recipients without any Firestore queries", async () => {
      const notifications = [
        { id: "n1", recipientId: "all", title: "Notice" } as Notification,
        { id: "n2", recipientId: "customer", title: "Promo" } as Notification,
      ];

      const res = await resolveNotificationRecipients(notifications);
      expect(mockGetDocs).not.toHaveBeenCalled();
      expect(res.get("all")).toBe("All Users");
      expect(res.get("customer")).toBe("All Customers");
    });

    it("batch-resolves customer recipients from users collection", async () => {
      mockGetDocs.mockResolvedValueOnce({
        forEach: (cb: any) => {
          cb({
            id: "uid-001",
            data: () => ({
              fullName: "Rahul Kumar",
              displayId: "MP-001",
              role: "customer",
            }),
          });
          cb({
            id: "uid-002",
            data: () => ({
              fullName: "Priya Sharma",
              displayId: "MP-002",
              role: "customer",
            }),
          });
        },
      });

      const notifications = [
        { id: "n1", recipientId: "uid-001", title: "Payment Received" } as Notification,
        { id: "n2", recipientId: "uid-002", title: "Order Assigned" } as Notification,
        { id: "n3", recipientId: "all", title: "System Alert" } as Notification,
      ];

      const res = await resolveNotificationRecipients(notifications);
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(res.get("uid-001")).toBe("Rahul Kumar (MP-001)");
      expect(res.get("uid-002")).toBe("Priya Sharma (MP-002)");
      expect(res.get("all")).toBe("All Users");
    });

    it("safely handles missing users in Firestore with clean allotted fallback", async () => {
      mockGetDocs.mockResolvedValueOnce({
        forEach: (_cb: any) => {}, // empty
      });

      const notifications = [
        {
          id: "n1",
          recipientId: "wtea9lQtgPVLLrrUEZVu58392019",
          title: "Payment Received",
        } as Notification,
      ];

      const res = await resolveNotificationRecipients(notifications);
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      const display = res.get("wtea9lQtgPVLLrrUEZVu58392019");
      expect(display).toBe("Customer (MP-WTEA9L)");
      expect(display).not.toContain("wtea9lQtgPVLLrrUEZVu58392019");
    });
  });
});
