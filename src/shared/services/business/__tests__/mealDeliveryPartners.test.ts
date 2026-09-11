import { describe, it, expect, vi, beforeEach } from "vitest";
import { customerService } from "../customerService";
import { orderService } from "../orderService";
import { userRepository } from "../../firestore/userRepository";
import { orderRepository } from "../../firestore/orderRepository";
import { deliveryZoneRepository } from "../../firestore/deliveryZoneRepository";
import { auditRepository } from "../../firestore/auditRepository";
import * as firestore from "firebase/firestore";

vi.mock("../../firestore/userRepository");
vi.mock("../../firestore/orderRepository");
vi.mock("../../firestore/deliveryZoneRepository");
vi.mock("../../firestore/auditRepository");

vi.spyOn(firestore, "serverTimestamp").mockReturnValue("mocked_timestamp" as any);

describe("mealDeliveryPartners logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Customer assignment service", () => {
    const mockCustomer = { id: "c1", role: "customer", deliveryPartnerId: "old", mealDeliveryPartners: { breakfast: "p_bf", lunch: "p_l", dinner: "p_d" } };
    const mockPartner = { id: "p1", role: "delivery_partner", isActive: true };

    beforeEach(() => {
      vi.spyOn(userRepository, "getById").mockImplementation(async (id) => {
        if (id === "c1") return mockCustomer as any;
        if (id === "p1") return mockPartner as any;
        return null;
      });
      vi.spyOn(userRepository, "update").mockResolvedValue(undefined);
      vi.spyOn(auditRepository, "logAction").mockResolvedValue(undefined as any);
      vi.spyOn(orderService, "syncCustomerActiveOrders").mockResolvedValue(undefined);
    });

    it("1. All Meals assignment sets global partner", async () => {
      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin", "all");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        deliveryPartnerId: "p1",
        mealDeliveryPartners: null
      }));
    });

    it("2. All Meals assignment clears existing breakfast/lunch/dinner overrides", async () => {
      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin", "all");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({ mealDeliveryPartners: null }));
    });

    it("3. Breakfast assignment changes only breakfast", async () => {
      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin", "breakfast");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: "p1", lunch: "p_l", dinner: "p_d" }
      }));
    });

    it("4. Lunch assignment changes only lunch", async () => {
      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin", "lunch");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: "p_bf", lunch: "p1", dinner: "p_d" }
      }));
    });

    it("5. Dinner assignment changes only dinner", async () => {
      await customerService.assignDeliveryPartner("c1", "p1", "a1", "Admin", "dinner");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: "p_bf", lunch: "p_l", dinner: "p1" }
      }));
    });

    it("6. Clearing Breakfast leaves Lunch/Dinner overrides intact", async () => {
      await customerService.assignDeliveryPartner("c1", null, "a1", "Admin", "breakfast");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: null, lunch: "p_l", dinner: "p_d" }
      }));
    });

    it("7. Clearing Lunch leaves Breakfast/Dinner intact", async () => {
      await customerService.assignDeliveryPartner("c1", null, "a1", "Admin", "lunch");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: "p_bf", lunch: null, dinner: "p_d" }
      }));
    });

    it("8. Clearing Dinner leaves Breakfast/Lunch intact", async () => {
      await customerService.assignDeliveryPartner("c1", null, "a1", "Admin", "dinner");
      expect(userRepository.update).toHaveBeenCalledWith("c1", expect.objectContaining({
        mealDeliveryPartners: { breakfast: "p_bf", lunch: "p_l", dinner: null }
      }));
    });
  });

  describe("Resolution logic (via syncCustomerActiveOrders)", () => {
    const mockOrder = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
    let batchUpdateMock: any;

    beforeEach(() => {
      batchUpdateMock = vi.fn();
      vi.spyOn(firestore, "writeBatch").mockReturnValue({ update: batchUpdateMock, commit: vi.fn().mockResolvedValue(true) } as any);
      vi.spyOn(orderRepository, "list").mockResolvedValue([mockOrder as any]);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([{ id: "z1", name: "Zone 1", pincodes: ["123"], kitchenId: "k1" } as any]);
    });

    it("9. Meal-specific eligible partner takes precedence over global", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", mealDeliveryPartners: { breakfast: "mealP" }, defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      const partnerGlobal = { id: "globalP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };
      const partnerMeal = { id: "mealP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };

      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerGlobal, partnerMeal] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "mealP" }));
    });

    it("10. Missing meal-specific preference falls back to global", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", mealDeliveryPartners: { breakfast: null }, defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      const partnerGlobal = { id: "globalP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };

      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerGlobal] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "globalP" }));
    });

    it("11. Ineligible meal-specific partner falls back to eligible global", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", mealDeliveryPartners: { breakfast: "mealP" }, defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      const partnerGlobal = { id: "globalP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };
      const partnerMeal = { id: "mealP", role: "delivery_partner", isActive: true, isAvailable: false, zoneIds: ["z1"], shifts: ["breakfast"] };

      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerGlobal, partnerMeal] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "globalP" }));
    });

    it("12. Ineligible meal-specific + ineligible global falls back to automatic eligible partner", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", mealDeliveryPartners: { breakfast: "mealP" }, defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      const partnerGlobal = { id: "globalP", role: "delivery_partner", isActive: true, isAvailable: false, zoneIds: ["z1"], shifts: ["breakfast"] };
      const partnerMeal = { id: "mealP", role: "delivery_partner", isActive: true, isAvailable: false, zoneIds: ["z1"], shifts: ["breakfast"] };
      const partnerAuto = { id: "autoP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };

      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerGlobal, partnerMeal, partnerAuto] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "autoP" }));
    });

    it("13. No eligible partner returns null", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([] as any); // no partners

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: null }));
    });

    it("14. Automatic fallback does not mutate customer preferences", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
      const partnerAuto = { id: "autoP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerAuto] as any);
      const updateSpy = vi.spyOn(userRepository, "update");

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("15. Legacy customer with no mealDeliveryPartners behaves exactly as before", async () => {
      const cust = { id: "c1", role: "customer", deliveryPartnerId: "globalP", defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] }; // no mealDeliveryPartners
      const partnerGlobal = { id: "globalP", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partnerGlobal] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "globalP" }));
    });
  });

  describe("Sync logic", () => {
    let batchUpdateMock: any;
    const cust = { id: "c1", role: "customer", defaultAddressId: "a1", addresses: [{id: "a1", pincode: "123"}] };
    const partner = { id: "p1", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: [] };

    beforeEach(() => {
      batchUpdateMock = vi.fn();
      vi.spyOn(firestore, "writeBatch").mockReturnValue({ update: batchUpdateMock, commit: vi.fn().mockResolvedValue(true) } as any);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([{ id: "z1", name: "Zone 1", pincodes: ["123"], kitchenId: "k1" } as any]);
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([partner] as any);
    });

    it("16. Breakfast change only affects Breakfast eligible active orders", async () => {
      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      const o2 = { id: "o2", customerId: "c1", status: "scheduled", mealType: "lunch" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1, o2] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("17. Lunch change only affects Lunch", async () => {
      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      const o2 = { id: "o2", customerId: "c1", status: "scheduled", mealType: "lunch" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1, o2] as any);

      await orderService.syncCustomerActiveOrders("c1", "lunch");
      expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("18. Dinner change only affects Dinner", async () => {
      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      const o2 = { id: "o2", customerId: "c1", status: "scheduled", mealType: "dinner" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1, o2] as any);

      await orderService.syncCustomerActiveOrders("c1", "dinner");
      expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("19. All Meals change handles all relevant active meal orders", async () => {
      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      const o2 = { id: "o2", customerId: "c1", status: "scheduled", mealType: "dinner" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1, o2] as any);

      await orderService.syncCustomerActiveOrders("c1", "all");
      expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    });

    it("20. Protected/in-progress orders are not reassigned", async () => {
      const o1 = { id: "o1", customerId: "c1", status: "out_for_delivery", mealType: "breakfast" };
      const o2 = { id: "o2", customerId: "c1", status: "picked_up", mealType: "lunch" };
      const o3 = { id: "o3", customerId: "c1", status: "delivered", mealType: "dinner" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1, o2, o3] as any);

      await orderService.syncCustomerActiveOrders("c1", "all");
      expect(batchUpdateMock).toHaveBeenCalledTimes(0);
    });
  });
});
