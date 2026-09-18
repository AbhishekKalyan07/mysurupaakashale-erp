import { describe, it, expect, vi, beforeEach } from "vitest";
import { customerService } from "../customerService";
import { getDocs } from "firebase/firestore";
import { userRepository } from "../../firestore/userRepository";
import { auditRepository } from "../../firestore/auditRepository";

describe("customerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue({ docs: [], forEach: vi.fn() } as any);
  });

  describe("assignDeliveryPartner", () => {
    it("throws if customerId is missing", async () => {
      await expect(
        customerService.assignDeliveryPartner("", "p1", "a1", "Admin"),
      ).rejects.toThrow("Customer ID is required.");
    });

    it("allows unassigning partner globally with null", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        deliveryPartnerId: "oldP1",
      } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignDeliveryPartner("c1", null, "a1", "Admin", "all");

      expect(userRepository.update).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ deliveryPartnerId: null, mealDeliveryPartners: null }),
      );
      expect(auditRepository.logAction).toHaveBeenCalledWith(
        "delivery_partner_unassigned",
        "a1",
        "admin",
        "Admin",
        "c1",
        "user",
        expect.objectContaining({ newPartnerId: null, newPartnerName: "Unassigned" }),
      );
    });

    it("throws if customer not found", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue(null);
      await expect(
        customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin"),
      ).rejects.toThrow("Customer with ID c1 not found.");
    });

    it("throws if partner not found", async () => {
      vi.spyOn(userRepository, "getById")
        .mockResolvedValueOnce({ id: "c1" } as any)
        .mockResolvedValueOnce(null);
      await expect(
        customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin"),
      ).rejects.toThrow(
        "Delivery partner with ID p1 not found or invalid role.",
      );
    });

    it("throws if partner has incorrect role", async () => {
      vi.spyOn(userRepository, "getById")
        .mockResolvedValueOnce({ id: "c1" } as any)
        .mockResolvedValueOnce({
          id: "p1",
          role: "customer",
          isActive: true,
          fullName: "Not Partner",
        } as any);
      await expect(
        customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin"),
      ).rejects.toThrow(
        "Delivery partner with ID p1 not found or invalid role.",
      );
    });

    it("throws if partner is inactive", async () => {
      vi.spyOn(userRepository, "getById")
        .mockResolvedValueOnce({ id: "c1" } as any)
        .mockResolvedValueOnce({
          id: "p1",
          role: "delivery_partner",
          isActive: false,
          fullName: "Inactive Partner",
        } as any);
      await expect(
        customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin"),
      ).rejects.toThrow(
        "Cannot assign inactive delivery partner Inactive Partner.",
      );
    });

    it("returns early if assigning the same partner (idempotency)", async () => {
      vi.spyOn(userRepository, "getById")
        .mockResolvedValueOnce({ id: "c1", deliveryPartnerId: "p1" } as any)
        .mockResolvedValueOnce({
          id: "p1",
          role: "delivery_partner",
          isActive: true,
          fullName: "Partner",
        } as any);

      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin");

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(auditRepository.logAction).not.toHaveBeenCalled();
    });

    it("assigns partner successfully and logs audit", async () => {
      vi.spyOn(userRepository, "getById")
        .mockResolvedValueOnce({ id: "c1", deliveryPartnerId: "oldP1" } as any)
        .mockResolvedValueOnce({
          id: "p1",
          role: "delivery_partner",
          isActive: true,
          fullName: "Partner",
        } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin");

      expect(userRepository.update).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ deliveryPartnerId: "p1" }),
      );
      expect(auditRepository.logAction).toHaveBeenCalledWith(
        "delivery_partner_assigned",
        "a1",
        "admin",
        "Admin",
        "c1",
        "user",
        expect.objectContaining({
          oldPartnerId: "oldP1",
          newPartnerId: "p1",
          newPartnerName: "Partner",
        }),
      );
    });
  });

  describe("assignCustomerZone", () => {
    it("throws if customerId is missing", async () => {
      await expect(
        customerService.assignCustomerZone("", "z1", "a1", "Admin"),
      ).rejects.toThrow("Customer ID is required.");
    });

    it("allows unassigning / resetting customer zone with null or empty string", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        zoneId: "oldZ1",
      } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignCustomerZone("c1", null, "a1", "Admin");

      expect(userRepository.update).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ zoneId: null }),
      );
      expect(auditRepository.logAction).toHaveBeenCalledWith(
        "customer_zone_unassigned",
        "a1",
        "admin",
        "Admin",
        "c1",
        "user",
        expect.objectContaining({ oldZoneId: "oldZ1", newZoneId: null }),
      );
    });

    it("throws if customer not found", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue(null);
      await expect(
        customerService.assignCustomerZone("c1", "z1", "a1", "Admin"),
      ).rejects.toThrow("Customer with ID c1 not found.");
    });

    it("throws if zone does not exist", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({ id: "c1" } as any);
      const { deliveryZoneRepository } = await import(
        "../../firestore/deliveryZoneRepository"
      );
      vi.spyOn(deliveryZoneRepository, "getById").mockResolvedValue(null);

      await expect(
        customerService.assignCustomerZone("c1", "z1", "a1", "Admin"),
      ).rejects.toThrow("Delivery zone with ID z1 not found.");
    });

    it("returns early if assigning the same zone (idempotency)", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        zoneId: "z1",
      } as any);
      const { deliveryZoneRepository } = await import(
        "../../firestore/deliveryZoneRepository"
      );
      vi.spyOn(deliveryZoneRepository, "getById").mockResolvedValue({
        id: "z1",
        name: "Zone 1",
        isActive: true,
      } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignCustomerZone("c1", "z1", "a1", "Admin");

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(auditRepository.logAction).not.toHaveBeenCalled();
    });

    it("assigns zone successfully and logs audit", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        zoneId: "oldZ1",
      } as any);
      const { deliveryZoneRepository } = await import(
        "../../firestore/deliveryZoneRepository"
      );
      vi.spyOn(deliveryZoneRepository, "getById").mockResolvedValue({
        id: "z1",
        name: "Zone 1",
        isActive: true,
      } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue();
      vi.spyOn(auditRepository, "logAction").mockResolvedValue();

      await customerService.assignCustomerZone("c1", "z1", "a1", "Admin");

      expect(userRepository.update).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ zoneId: "z1" }),
      );
      expect(auditRepository.logAction).toHaveBeenCalledWith(
        "customer_zone_assigned",
        "a1",
        "admin",
        "Admin",
        "c1",
        "user",
        expect.objectContaining({ oldZoneId: "oldZ1", newZoneId: "z1" }),
      );
    });
  });
});
