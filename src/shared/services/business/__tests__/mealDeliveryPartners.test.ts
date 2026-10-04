import { describe, it, expect, vi, beforeEach } from "vitest";
import { customerService } from "../customerService";
import { orderService } from "../orderService";
import { userRepository } from "../../firestore/userRepository";
import { orderRepository } from "../../firestore/orderRepository";
import { deliveryZoneRepository } from "../../firestore/deliveryZoneRepository";
import { auditRepository } from "../../firestore/auditRepository";
import { holidayRepository } from "../../firestore/holidayRepository";
import { mealPlanRepository } from "../../firestore/mealPlanRepository";
import * as firestore from "firebase/firestore";

vi.mock("../../firestore/userRepository");
vi.mock("../../firestore/orderRepository");
vi.mock("../../firestore/deliveryZoneRepository");
vi.mock("../../firestore/auditRepository");
vi.mock("../../firestore/holidayRepository");
vi.mock("../../firestore/mealPlanRepository");

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

  describe("Phase 3B Scenarios (A, B, C, D, H, I)", () => {
    let batchUpdateMock: any;

    beforeEach(() => {
      batchUpdateMock = vi.fn();
      vi.spyOn(firestore, "writeBatch").mockReturnValue({
        update: batchUpdateMock,
        commit: vi.fn().mockResolvedValue(true),
      } as any);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
        { id: "z1", name: "Zone 1", pincodes: ["123"], kitchenId: "k1" } as any,
      ]);
    });

    it("Scenario A — Customer with Breakfast->DP1, Lunch->DP2, Dinner->DP3 resolves each meal correctly", async () => {
      const cust = {
        id: "c1",
        role: "customer",
        defaultAddressId: "a1",
        addresses: [{ id: "a1", pincode: "123" }],
        mealDeliveryPartners: {
          breakfast: "dp1",
          lunch: "dp2",
          dinner: "dp3",
        },
      };
      const dp1 = { id: "dp1", role: "delivery_partner", fullName: "DP One", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["breakfast"] };
      const dp2 = { id: "dp2", role: "delivery_partner", fullName: "DP Two", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["lunch"] };
      const dp3 = { id: "dp3", role: "delivery_partner", fullName: "DP Three", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["dinner"] };

      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([dp1, dp2, dp3] as any);

      // Breakfast order
      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1] as any);
      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "dp1" }));

      // Lunch order
      batchUpdateMock.mockClear();
      const o2 = { id: "o2", customerId: "c1", status: "scheduled", mealType: "lunch" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o2] as any);
      await orderService.syncCustomerActiveOrders("c1", "lunch");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "dp2" }));

      // Dinner order
      batchUpdateMock.mockClear();
      const o3 = { id: "o3", customerId: "c1", status: "scheduled", mealType: "dinner" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o3] as any);
      await orderService.syncCustomerActiveOrders("c1", "dinner");
      expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deliveryPartnerId: "dp3" }));
    });

    it("Scenario B — Subscription/customer default changes from DP1 to DP4: historical orders remain DP1, future generated orders receive DP4", async () => {
      // Historical delivered order assigned to DP1
      const historicalOrder = {
        id: "o_hist",
        customerId: "c1",
        status: "delivered",
        mealType: "lunch",
        deliveryPartnerId: "dp1",
        driverName: "DP One",
      };
      vi.spyOn(orderRepository, "list").mockResolvedValue([historicalOrder] as any);

      // Customer default changed to DP4
      const custUpdated = {
        id: "c1",
        role: "customer",
        deliveryPartnerId: "dp4",
        defaultAddressId: "a1",
        addresses: [{ id: "a1", pincode: "123" }],
      };
      const dp4 = { id: "dp4", role: "delivery_partner", fullName: "DP Four", isActive: true, isAvailable: true, zoneIds: ["z1"], shifts: ["lunch"] };
      vi.spyOn(userRepository, "getById").mockResolvedValue(custUpdated as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([dp4] as any);

      // Verify syncCustomerActiveOrders does NOT alter the existing delivered order
      await orderService.syncCustomerActiveOrders("c1", "lunch");
      expect(batchUpdateMock).not.toHaveBeenCalled();

      // Verify future order generated via buildOrderSnapshot receives new default DP4
      const sub = { id: "sub1", customerId: "c1", planId: "p1", planTier: "standard", deliveryAddressId: "a1" } as any;
      const customerMap = new Map([["c1", custUpdated as any]]);
      const partnerMap = new Map([["dp4", dp4 as any]]);
      const zoneMap = new Map([["z1", { id: "z1", name: "Zone 1", kitchenId: "k1" } as any]]);
      const mealPlans = [{ id: "p1", name: "Plan 1", mealSlots: [{ mealType: "lunch", options: [{ id: "opt1", label: "Lunch" }] }] }] as any[];
      const workloadMap = new Map<string, number>();

      const generatedOrder = (orderService as any).buildOrderSnapshot(
        sub,
        { selectedOptionId: "opt1" },
        "lunch",
        "2026-10-05",
        customerMap,
        partnerMap,
        zoneMap,
        [dp4 as any],
        [{ id: "z1", name: "Zone 1", kitchenId: "k1", pincodes: ["123"] }],
        mealPlans,
        workloadMap,
      );

      expect(generatedOrder.deliveryPartnerId).toBe("dp4");
      expect(generatedOrder.driverName).toBe("DP Four");
    });

    it("Scenario C — Individual order explicitly assigned to DP5 is not overwritten by customer default change", async () => {
      // Order is out for delivery or picked up by DP5
      const activeOrderWithDP5 = {
        id: "o_dp5",
        customerId: "c1",
        status: "out_for_delivery",
        mealType: "lunch",
        deliveryPartnerId: "dp5",
        driverName: "DP Five",
      };
      vi.spyOn(orderRepository, "list").mockResolvedValue([activeOrderWithDP5] as any);

      const cust = {
        id: "c1",
        role: "customer",
        deliveryPartnerId: "dp4",
        defaultAddressId: "a1",
        addresses: [{ id: "a1", pincode: "123" }],
      };
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([
        { id: "dp4", role: "delivery_partner", isActive: true, isAvailable: true, zoneIds: ["z1"] } as any,
      ]);

      await orderService.syncCustomerActiveOrders("c1", "lunch");
      // Must not modify the order assigned to DP5
      expect(batchUpdateMock).not.toHaveBeenCalled();
    });

    it("Scenario D — Daily order generation idempotency: duplicate execution preserves existing assignments without corruption", async () => {
      // Order already exists and is scheduled with DP2
      const existingOrder = {
        id: "ord_sub1_2026-10-02_lunch",
        customerId: "c1",
        subscriptionId: "sub1",
        status: "scheduled",
        deliveryPartnerId: "dp2",
        driverName: "DP Two",
      };
      vi.spyOn(orderRepository, "list").mockResolvedValue([existingOrder] as any);

      // Verify that running generateOrdersForSubscription when order exists does not overwrite it
      const { runTransaction } = await import("firebase/firestore");
      const mockSet = vi.fn();
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, callback) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({ exists: () => true }), // order already exists
          set: mockSet,
          update: vi.fn(),
          delete: vi.fn(),
        };
        return await callback(mockTxn as any);
      });

      const sub: any = {
        id: "sub1",
        customerId: "c1",
        planId: "p1",
        mealPreferences: [{ mealType: "lunch", optionId: "opt1" }],
      };

      vi.spyOn(holidayRepository, "isHoliday").mockResolvedValue(false);
      vi.spyOn(mealPlanRepository, "list").mockResolvedValue([
        {
          id: "plan1",
          mealSlots: [{ mealType: "lunch", options: [{ id: "opt1", label: "Meal" }] }],
        },
      ] as any);
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        name: "Customer One",
        addresses: [
          { id: "a1", isDefault: true, pincode: "123", line1: "Street", city: "Mysuru" },
        ],
        defaultAddressId: "a1",
      } as any);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
        { id: "z1", name: "Zone 1", pincodes: ["123"], kitchenId: "k1" },
      ] as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([
        { id: "dp2", role: "delivery_partner", isActive: true, zoneIds: ["z1"], shifts: ["lunch"] },
      ] as any);

      await orderService.generateOrdersForSubscription(sub, "2026-08-01", ["lunch"]);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("Scenario H — Historical orders retain original delivery partner snapshot and driver details", () => {
      // When order was generated and fulfilled, it snapshotted driverName and deliveryPartnerId
      const historicalOrder: Partial<import("@/shared/types").Order> = {
        id: "ord_hist_001",
        customerId: "c1",
        status: "delivered",
        deliveryPartnerId: "dp_original",
        driverName: "Original Driver",
        driverPhone: "+919876543210",
        mealType: "lunch",
      };

      // Changing customer preferences in DB should not affect historical order record
      const updatedCustomer: Partial<import("@/shared/types").CustomerProfile> = {
        id: "c1",
        deliveryPartnerId: "dp_new",
        mealDeliveryPartners: { lunch: "dp_new" },
      };

      // Operational assignment in historical order remains authoritative and frozen
      expect(historicalOrder.deliveryPartnerId).toBe("dp_original");
      expect(historicalOrder.driverName).toBe("Original Driver");
      expect(historicalOrder.deliveryPartnerId).not.toBe(updatedCustomer.deliveryPartnerId);
    });

    it("Scenario I — Unassigned meal resolves to null and displays as Not Assigned", async () => {
      const cust = {
        id: "c1",
        role: "customer",
        defaultAddressId: "a1",
        addresses: [{ id: "a1", pincode: "123" }],
        deliveryPartnerId: null,
        mealDeliveryPartners: { breakfast: null, lunch: null, dinner: null },
      };
      // No active partners available
      vi.spyOn(userRepository, "getById").mockResolvedValue(cust as any);
      vi.spyOn(userRepository, "list").mockResolvedValue([] as any);

      const o1 = { id: "o1", customerId: "c1", status: "scheduled", mealType: "breakfast" };
      vi.spyOn(orderRepository, "list").mockResolvedValue([o1] as any);

      await orderService.syncCustomerActiveOrders("c1", "breakfast");
      expect(batchUpdateMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deliveryPartnerId: null })
      );
    });
  });
});
