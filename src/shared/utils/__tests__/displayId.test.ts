import { describe, it, expect } from "vitest";
import { formatAllottedId, isFormattedDisplayId } from "../displayId";

describe("displayId utility", () => {
  describe("isFormattedDisplayId", () => {
    it("recognizes customer allotted IDs", () => {
      expect(isFormattedDisplayId("MP-A001")).toBe(true);
      expect(isFormattedDisplayId("MP-K102")).toBe(true);
      expect(isFormattedDisplayId("CUST-1001")).toBe(true);
    });

    it("recognizes staff allotted IDs", () => {
      expect(isFormattedDisplayId("ADMIN-1001")).toBe(true);
      expect(isFormattedDisplayId("KTCH-1002")).toBe(true);
      expect(isFormattedDisplayId("DLVY-1005")).toBe(true);
      expect(isFormattedDisplayId("ACCT-1003")).toBe(true);
      expect(isFormattedDisplayId("STAFF-101")).toBe(true);
    });

    it("rejects raw Firebase UIDs and UUIDs", () => {
      expect(isFormattedDisplayId("wtea9lQtgPVLLrrUEZVu58392019")).toBe(false);
      expect(isFormattedDisplayId("0Sqha2d0SQS8egVhQN00L3821092")).toBe(false);
      expect(isFormattedDisplayId("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    });

    it("handles null/undefined/empty gracefully", () => {
      expect(isFormattedDisplayId("")).toBe(false);
      expect(isFormattedDisplayId(null)).toBe(false);
      expect(isFormattedDisplayId(undefined)).toBe(false);
    });
  });

  describe("formatAllottedId", () => {
    it("returns genuine displayId when present", () => {
      expect(formatAllottedId("MP-A001", "wtea9lQtgPVLLrrUEZVu")).toBe("MP-A001");
      expect(formatAllottedId("ADMIN-1001", "adminUid1234567890123")).toBe("ADMIN-1001");
    });

    it("formats short allotted fallback when displayId is missing", () => {
      const rawCustomerUid = "wtea9lQtgPVLLrrUEZVu";
      expect(formatAllottedId(null, rawCustomerUid, "customer")).toBe("MP-WTEA9L");

      const rawAdminUid = "0Sqha2d0SQS8egVhQN00";
      expect(formatAllottedId(undefined, rawAdminUid, "admin")).toBe("ADMIN-0SQH");

      const rawKitchenUid = "ktchUid998877665544";
      expect(formatAllottedId(null, rawKitchenUid, "kitchen")).toBe("KTCH-KTCH");

      const rawDeliveryUid = "dlvyUid998877665544";
      expect(formatAllottedId(null, rawDeliveryUid, "delivery_partner")).toBe("DLVY-DLVY");
    });

    it("returns N/A when neither displayId nor uid is provided", () => {
      expect(formatAllottedId(null, null)).toBe("N/A");
      expect(formatAllottedId("", "")).toBe("N/A");
      expect(formatAllottedId(undefined, undefined)).toBe("N/A");
    });
  });
});
