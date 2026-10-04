import { describe, it, expect, vi, beforeEach } from "vitest";
import { deliveryZoneRepository, DEFAULT_DELIVERY_ZONES } from "../deliveryZoneRepository";
import * as firestore from "firebase/firestore";

describe("deliveryZoneRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("returns zones from Firestore when collection is populated", async () => {
      vi.spyOn(firestore, "getDocs").mockResolvedValue({
        empty: false,
        docs: [
          {
            id: "custom-zone-1",
            data: () => ({
              id: "custom-zone-1",
              name: "Custom Zone",
              pincodes: ["570099"],
              kitchenId: "k-custom",
              isActive: true,
            }),
          },
        ],
      } as any);

      const res = await deliveryZoneRepository.list();
      expect(res.length).toBe(1);
      expect(res[0].id).toBe("custom-zone-1");
      expect(res[0].pincodes).toContain("570099");
    });

    it("falls back to DEFAULT_DELIVERY_ZONES when Firestore collection is empty", async () => {
      vi.spyOn(firestore, "getDocs").mockResolvedValue({
        empty: true,
        docs: [],
      } as any);

      const res = await deliveryZoneRepository.list();
      expect(res).toEqual(DEFAULT_DELIVERY_ZONES);
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].pincodes).toContain("570001");
      expect(res[0].pincodes).toContain("570002");
    });

    it("falls back to DEFAULT_DELIVERY_ZONES when Firestore read throws an error", async () => {
      vi.spyOn(firestore, "getDocs").mockRejectedValue(new Error("Permission denied or missing collection"));

      const res = await deliveryZoneRepository.list();
      expect(res).toEqual(DEFAULT_DELIVERY_ZONES);
    });
  });
});
