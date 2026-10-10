import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductionService } from "../productionService";
import { orderRepository } from "../../firestore/orderRepository";
import { auditRepository } from "../../firestore/auditRepository";

vi.mock("../../firestore/orderRepository", () => ({
  orderRepository: {
    getById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(),
  },
}));

describe("productionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Aggregation Methods", () => {
    const orders = [
      {
        id: "o1",
        mealType: "breakfast",
        status: "packing",
        source: "subscription",
        planTier: "basic",
        itemsLabel: "Idli",
        customerId: "c5",
      },
      {
        id: "o2",
        mealType: "lunch",
        status: "ready_for_pickup",
        source: "subscription",
        planTier: "regular",
        itemsLabel: "Meals",
        customerId: "c2",
      },
      {
        id: "o3",
        mealType: "lunch",
        status: "cancelled",
        source: "one_time",
        itemsLabel: "Biryani",
        customerId: "c3",
      },
      {
        id: "o4",
        mealType: "dinner",
        status: "scheduled",
        source: "one_time",
        itemsLabel: "Chapati",
        customerId: "c4",
      },
      {
        id: "o5",
        mealType: "breakfast",
        status: "out_for_delivery",
        source: "subscription",
        planTier: "basic",
        itemsLabel: "Idli",
        zoneId: "z1",
        customerId: "c2",
      },
      {
        id: "o6",
        mealType: "breakfast",
        status: "delivered",
        source: "one_time",
        itemsLabel: "Dose",
        zoneId: "z2",
        deliveryPartnerId: "p1",
        customerId: "c1",
      },
    ] as any[];

    it("getProductionSummary calculates totals correctly ignoring cancelled", () => {
      const summary = ProductionService.getProductionSummary(orders);
      expect(summary).toEqual({ breakfast: 3, lunch: 1, dinner: 1, total: 5 });
    });

    it("getPlanSummary calculates plans correctly ignoring cancelled", () => {
      const summary = ProductionService.getPlanSummary(orders);
      expect(summary).toEqual({ basic: 2, regular: 1, oneTime: 2 }); // o3 is cancelled oneTime so not counted
    });

    it("getMealBreakdown calculates exact items per mealType", () => {
      const breakdown = ProductionService.getMealBreakdown(orders, "breakfast");
      expect(breakdown).toEqual([
        { itemName: "Idli", count: 2 },
        { itemName: "Dose", count: 1 },
      ]);
    });

    it("getProductionProgress calculates progress correctly", () => {
      const progress = ProductionService.getProductionProgress(orders);
      // Orders: o1(packing), o2(ready_for_pickup), o3(cancelled), o4(scheduled), o5(out_for_delivery), o6(delivered)
      // total = 5 (excludes o3 which is cancelled)
      // scheduled = 1 (o4)
      // packing = 1 (o1)
      // packed = 0
      // ready = 1 (o2)
      // cancelled = 1 (o3)
      // completed (for %): ready + out_for_delivery + delivered = 1(o2) + 1(o5) + 1(o6) = 3
      // completionPercentage = round(3/5 * 100) = 60
      expect(progress).toEqual({
        total: 5,
        scheduled: 1,
        packing: 1,
        packed: 0,
        ready: 1,
        cancelled: 1,
        completionPercentage: 60,
      });
    });

    it("getProductionProgress handles empty array", () => {
      expect(ProductionService.getProductionProgress([])).toEqual({
        total: 0,
        scheduled: 0,
        packing: 0,
        packed: 0,
        ready: 0,
        cancelled: 0,
        completionPercentage: 0,
      });
    });

    it("getAreaPacking groups correctly", () => {
      const zoneMap = new Map([
        ["z1", "Zone 1"],
        ["z2", "Zone 2"],
      ]);
      const customerMap = new Map([["c1", "Customer 1"]]);
      const packing = ProductionService.getAreaPacking(
        orders,
        zoneMap,
        customerMap,
      );

      expect(packing.length).toBe(3); // Unassigned, Zone 1, Zone 2
      expect(packing.find((p) => p.areaName === "Zone 1")).toEqual(
        expect.objectContaining({ breakfast: 1, basic: 1 }),
      );
    });

    it("getPrintPackingSheet formats rows correctly", () => {
      const zoneMap = new Map([["z1", "Zone 1"]]);
      const partnerMap = new Map([["p1", "Partner 1"]]);
      const customerMap = new Map([["c1", "Customer 1"]]);

      const sheet = ProductionService.getPrintPackingSheet(
        orders,
        zoneMap,
        partnerMap,
        customerMap,
      );
      expect(sheet.length).toBe(5);

      const o6Row = sheet.find((r) => r.customerName === "Customer 1");
      expect(o6Row).toEqual(
        expect.objectContaining({
          area: "z2", // z2 not in zoneMap, falls back to id
          customerName: "Customer 1",
          mealType: "breakfast",
          meal: "Dose",
          plan: "One-Time",
          deliveryPartner: "Partner 1",
        }),
      );
    });

    it("getPrintPackingSheet normalizes canonical mealType and preserves dish/item label", () => {
      const customOrders = [
        {
          id: "ord_101",
          displayId: "MP-101",
          mealType: "  BREAKFAST  ",
          status: "scheduled",
          source: "subscription",
          planTier: "basic",
          itemsLabel: "Idli, Vada (2 pcs)",
          customerId: "c101",
          customerName: "Ramesh Kumar",
          zoneId: "zone_south",
          deliveryPartnerId: "dp_1",
          mealQuantity: 2,
        },
        {
          id: "ord_102",
          displayId: "MP-102",
          mealType: "Lunch",
          status: "packing",
          source: "subscription",
          planTier: "regular",
          itemsLabel: "South Indian Thali",
          customerId: "c102",
          customerName: "Suresh Gowda",
          zoneId: "zone_north",
          mealQuantity: 1,
        },
      ] as any[];

      const zoneMap = new Map([
        ["zone_south", "South Zone"],
        ["zone_north", "North Zone"],
      ]);
      const partnerMap = new Map([["dp_1", "Ravi Delivery"]]);
      const customerMap = new Map();

      const rows = ProductionService.getPrintPackingSheet(
        customOrders,
        zoneMap,
        partnerMap,
        customerMap,
      );

      expect(rows).toHaveLength(2);

      const r1 = rows.find((r) => r.displayId === "MP-101");
      expect(r1).toBeDefined();
      expect(r1?.mealType).toBe("breakfast"); // normalized canonical
      expect(r1?.meal).toBe("Idli, Vada (2 pcs)"); // preserved dish label
      expect(r1?.quantity).toBe(2);
      expect(r1?.area).toBe("South Zone");
      expect(r1?.deliveryPartner).toBe("Ravi Delivery");

      const r2 = rows.find((r) => r.displayId === "MP-102");
      expect(r2).toBeDefined();
      expect(r2?.mealType).toBe("lunch"); // normalized canonical
      expect(r2?.meal).toBe("South Indian Thali"); // preserved dish label
      expect(r2?.quantity).toBe(1);
      expect(r2?.area).toBe("North Zone");
    });

    describe("Phase 4B — Special Handling & Privacy Invariants", () => {
      const zoneMap = new Map([
        ["z_north", "North Area"],
        ["z_south", "South Area"],
      ]);
      const customerMap = new Map([
        ["cust_1", "Asha Devi"],
        ["cust_2", "Basavaraj"],
        ["cust_3", "Chetan Kumar"],
        ["cust_4", "Deepa Rao"],
      ]);

      const testOrders = [
        {
          id: "ord_sub_uuid_101",
          customerCode: "MP-001",
          customerId: "cust_1",
          mealType: "breakfast",
          itemsLabel: "Idli Sambar",
          mealQuantity: 2,
          zoneId: "z_north",
          status: "scheduled",
          specialInstructions: "Less spicy sambar",
        },
        {
          id: "ord_sub_uuid_102",
          customerCode: "MP-002",
          customerId: "cust_2",
          mealType: "breakfast",
          itemsLabel: "Masala Dose",
          mealQuantity: 1,
          zoneId: "z_north",
          status: "packing",
          packingNotes: "Pack chutney separately",
        },
        {
          id: "ord_sub_uuid_103",
          customerCode: "MP-003",
          customerId: "cust_3",
          mealType: "lunch",
          itemsLabel: "South Indian Thali",
          mealQuantity: 1,
          zoneId: "z_south",
          status: "scheduled",
          specialInstructions: "No onion / garlic",
          packingNotes: "Extra papad",
        },
        {
          id: "ord_sub_uuid_104",
          customerCode: "MP-004",
          customerId: "cust_4",
          mealType: "dinner",
          itemsLabel: "Chapati Curry",
          mealQuantity: 3,
          zoneId: "z_south",
          status: "scheduled",
          // No specialInstructions and no packingNotes
        },
        {
          id: "ord_sub_uuid_cancelled",
          customerCode: "MP-005",
          customerId: "cust_5",
          mealType: "breakfast",
          itemsLabel: "Poori Saagu",
          mealQuantity: 1,
          zoneId: "z_north",
          status: "cancelled",
          specialInstructions: "Hot water needed",
        },
        {
          id: "ord_sub_uuid_skipped",
          customerCode: "MP-006",
          customerId: "cust_6",
          mealType: "lunch",
          itemsLabel: "Veg Meals",
          mealQuantity: 1,
          zoneId: "z_south",
          status: "skipped",
          packingNotes: "Pack curd separately",
        },
      ] as any[];

      it("getSpecialHandlingOrders identifies orders with specialInstructions only", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        const match = special.find((s) => s.id === "ord_sub_uuid_101");
        expect(match).toBeDefined();
        expect(match?.specialInstructions).toBe("Less spicy sambar");
        expect(match?.packingNotes).toBeUndefined();
        expect(match?.displayId).toBe("MP-001");
        expect(match?.mealName).toBe("Idli Sambar");
        expect(match?.quantity).toBe(2);
        expect(match?.area).toBe("North Area");
      });

      it("getSpecialHandlingOrders identifies orders with packingNotes only", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        const match = special.find((s) => s.id === "ord_sub_uuid_102");
        expect(match).toBeDefined();
        expect(match?.packingNotes).toBe("Pack chutney separately");
        expect(match?.specialInstructions).toBeUndefined();
        expect(match?.displayId).toBe("MP-002");
      });

      it("orders containing both note fields appear only once (no duplicates)", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        const matches = special.filter((s) => s.id === "ord_sub_uuid_103");
        expect(matches).toHaveLength(1);
        expect(matches[0].specialInstructions).toBe("No onion / garlic");
        expect(matches[0].packingNotes).toBe("Extra papad");
      });

      it("orders without any notes are excluded", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        const match = special.find((s) => s.id === "ord_sub_uuid_104");
        expect(match).toBeUndefined();
      });

      it("cancelled and skipped orders are excluded from active special handling", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        expect(special.find((s) => s.id === "ord_sub_uuid_cancelled")).toBeUndefined();
        expect(special.find((s) => s.id === "ord_sub_uuid_skipped")).toBeUndefined();
      });

      it("sorts special handling orders by canonical meal, then area, then customer", () => {
        const special = ProductionService.getSpecialHandlingOrders(
          testOrders,
          zoneMap,
          customerMap,
        );
        expect(special).toHaveLength(3); // 101 (breakfast), 102 (breakfast), 103 (lunch)
        expect(special[0].mealType).toBe("breakfast");
        expect(special[1].mealType).toBe("breakfast");
        expect(special[2].mealType).toBe("lunch");
      });

      it("getAreaPacking adds accurate specialHandlingCount counting distinct eligible orders", () => {
        const packing = ProductionService.getAreaPacking(
          testOrders,
          zoneMap,
          customerMap,
        );
        const northGroup = packing.find((p) => p.areaName === "North Area");
        expect(northGroup).toBeDefined();
        // North has 101 (specialInstructions) and 102 (packingNotes) active. Cancelled order excluded.
        expect(northGroup?.specialHandlingCount).toBe(2);

        const southGroup = packing.find((p) => p.areaName === "South Area");
        expect(southGroup).toBeDefined();
        // South has 103 (both notes, counts as 1) and 104 (no notes). Skipped order excluded.
        expect(southGroup?.specialHandlingCount).toBe(1);
      });

      it("displayId privacy fix: missing displayId uses canonical formatAllottedId and never leaks raw UUID fragments", () => {
        const unformattedOrders = [
          {
            id: "ord_sub_123456789abcdef_20261010",
            customerId: "wtea9lQtgPVLLrrUEZVu58392019",
            mealType: "breakfast",
            status: "scheduled",
            itemsLabel: "Idli",
            zoneId: "z_north",
          },
          {
            id: "plain_order_doc_id_9999",
            customerId: "abcxyz12345678901234567890",
            mealType: "lunch",
            status: "scheduled",
            itemsLabel: "Meals",
            zoneId: "z_south",
          },
        ] as any[];

        const areaPacking = ProductionService.getAreaPacking(
          unformattedOrders,
          zoneMap,
          new Map(),
        );

        for (const group of areaPacking) {
          for (const order of group.orders) {
            // Must be canonical allotted format (MP-XXXXXX), NEVER raw orderId substring like "sub" or "plain"
            expect(order.displayId).toMatch(/^MP-[A-Z0-9]+$/);
            expect(order.displayId).not.toContain("sub");
            expect(order.displayId).not.toContain("plain");
            expect(order.displayId).not.toContain("123456789");
          }
        }

        const printRows = ProductionService.getPrintPackingSheet(
          unformattedOrders,
          zoneMap,
          new Map(),
          new Map(),
        );

        for (const row of printRows) {
          expect(row.displayId).toMatch(/^MP-[A-Z0-9]+$/);
          expect(row.displayId).not.toContain("sub");
          expect(row.displayId).not.toContain("plain");
        }
      });
    });
  });

  describe("Lifecycle Methods", () => {
    const adminId = "a1";

    describe("startPreparing", () => {
      it("throws if orderId missing", async () => {
        await expect(
          ProductionService.startPreparing("", adminId),
        ).rejects.toThrow("Order ID is required.");
      });

      it("throws if order not found", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue(null);
        await expect(
          ProductionService.startPreparing("o1", adminId),
        ).rejects.toThrow("Order o1 not found.");
      });

      it("returns early if already preparing (idempotency)", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "preparing",
        } as any);
        await ProductionService.startPreparing("o1", adminId);
        expect(orderRepository.update).not.toHaveBeenCalled();
      });

      it("throws if invalid transition", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "ready_for_pickup",
        } as any);
        await expect(
          ProductionService.startPreparing("o1", adminId),
        ).rejects.toThrow(
          "Cannot transition from ready_for_pickup to preparing.",
        );
      });

      it("updates status and logs audit", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "scheduled",
        } as any);
        await ProductionService.startPreparing("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "preparing",
        });
        expect(auditRepository.logAction).toHaveBeenCalledWith(
          "production_preparing",
          adminId,
          "admin",
          "Admin",
          "o1",
          "order",
          expect.any(Object),
        );
      });
    });

    describe("markReady", () => {
      it("throws if orderId missing", async () => {
        await expect(ProductionService.markReady("", adminId)).rejects.toThrow(
          "Order ID is required.",
        );
      });

      it("throws if invalid transition", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "scheduled",
        } as any);
        await expect(
          ProductionService.markReady("o1", adminId),
        ).rejects.toThrow(
          "Cannot transition from scheduled to ready_for_pickup.",
        );
      });

      it("updates status", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "preparing",
        } as any);
        await ProductionService.markReady("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "ready_for_pickup",
        });
      });
    });

    describe("lockProduction", () => {
      it("throws if orderId missing", async () => {
        await expect(
          ProductionService.lockProduction("", adminId),
        ).rejects.toThrow("Order ID is required.");
      });

      it("throws if invalid transition", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "preparing",
        } as any);
        await expect(
          ProductionService.lockProduction("o1", adminId),
        ).rejects.toThrow("Cannot transition from preparing to locked.");
      });

      it("updates status", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "ready_for_pickup",
        } as any);
        await ProductionService.lockProduction("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "locked",
        });
      });
    });

    describe("closeProduction", () => {
      it("throws if orderId missing", async () => {
        await expect(
          ProductionService.closeProduction("", adminId),
        ).rejects.toThrow("Order ID is required.");
      });

      it("throws if invalid transition", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "ready_for_pickup",
        } as any);
        await expect(
          ProductionService.closeProduction("o1", adminId),
        ).rejects.toThrow("Cannot transition from ready_for_pickup to closed.");
      });

      it("updates status", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "locked",
        } as any);
        await ProductionService.closeProduction("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "closed",
        });
      });
    });

    describe("reopenProduction", () => {
      it("throws if orderId missing", async () => {
        await expect(
          ProductionService.reopenProduction("", adminId),
        ).rejects.toThrow("Order ID is required.");
      });

      it("throws if invalid transition", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "ready_for_pickup",
        } as any);
        await expect(
          ProductionService.reopenProduction("o1", adminId),
        ).rejects.toThrow(
          "Cannot transition from ready_for_pickup to reopened.",
        );
      });

      it("updates status from closed", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "closed",
        } as any);
        await ProductionService.reopenProduction("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "reopened",
        });
      });

      it("updates status from locked", async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({
          status: "locked",
        } as any);
        await ProductionService.reopenProduction("o1", adminId);
        expect(orderRepository.update).toHaveBeenCalledWith("o1", {
          status: "reopened",
        });
      });
    });
  });
});
