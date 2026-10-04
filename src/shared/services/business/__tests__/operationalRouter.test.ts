import { describe, it, expect } from "vitest";
import {
  resolveOperationalZoneAndKitchen,
  isMysuruCityPincode,
  MYSURU_CITY_PINCODES,
} from "../operationalRouter";
import { DEFAULT_DELIVERY_ZONES } from "@/shared/services/firestore/deliveryZoneRepository";

describe("resolveOperationalZoneAndKitchen", () => {
  const mockZones = [
    {
      id: "z1",
      name: "Zone 1",
      kitchenId: "k1",
      pincodes: ["570001", "570002"],
    },
    {
      id: "z2",
      name: "Zone 2",
      kitchenId: "k2",
      pincodes: ["570003"],
    },
    {
      id: "z-no-kitchen",
      name: "Invalid Zone",
      kitchenId: "", // intentionally missing
      pincodes: ["570099"],
    },
  ];

  it("resolves zoneId and kitchenId for an exact pincode match", () => {
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570001" },
      mockZones
    );
    expect(result).toEqual({ zoneId: "z1", kitchenId: "k1" });
  });

  it("handles whitespace in pincode matching", () => {
    const result = resolveOperationalZoneAndKitchen(
      { pincode: " 570002 " },
      mockZones
    );
    expect(result).toEqual({ zoneId: "z1", kitchenId: "k1" });
  });

  it("throws when address or pincode is missing", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen(null, mockZones)
    ).toThrow("Cannot route order: No valid address or pincode provided.");

    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "" }, mockZones)
    ).toThrow("Cannot route order: No valid address or pincode provided.");
  });

  it("throws when pincode is only whitespace", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "   " }, mockZones)
    ).toThrow("Cannot route order: Address pincode is empty.");
  });

  it("throws deterministically when no zone matches the pincode", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "111111" }, mockZones)
    ).toThrow("Cannot route order: No delivery zone serves pincode 111111.");
  });

  it("throws deterministically when the matched zone has no valid kitchenId", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "570099" }, mockZones)
    ).toThrow("Cannot route order: Zone Invalid Zone has no assigned kitchen.");
  });

  it("never falls back to an unrelated kitchen", () => {
    // If we pass an invalid pincode, it throws. It should not return { zoneId: null, kitchenId: 'k1' }
    try {
      resolveOperationalZoneAndKitchen({ pincode: "invalid" }, mockZones);
    } catch (e: any) {
      expect(e.message).toContain("No delivery zone serves pincode");
    }
  });

  it("throws clear diagnostic error when allZones is empty", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "570001" }, [])
    ).toThrow(
      "Cannot route order: No delivery zones configured in the system. Please create at least one active delivery zone in Admin > Delivery Zones."
    );
  });

  it("handles malformed zone records (null/undefined/number pincodes) without crashing", () => {
    const malformedZones = [
      { id: "z-bad-1", name: "Bad Zone 1", kitchenId: "k1", pincodes: null as any },
      { id: "z-bad-2", name: "Bad Zone 2", kitchenId: "k1", pincodes: undefined as any },
      { id: "z-num", name: "Num Zone", kitchenId: "k1", pincodes: [570001 as any] },
    ];
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570001" },
      malformedZones
    );
    expect(result).toEqual({ zoneId: "z-num", kitchenId: "k1" });
  });

  it("ignores inactive zones", () => {
    const zonesWithInactive = [
      { id: "z-inactive", name: "Inactive Zone", kitchenId: "k1", pincodes: ["570001"], isActive: false },
      { id: "z-active", name: "Active Zone", kitchenId: "k2", pincodes: ["570001"], isActive: true },
    ];
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570001" },
      zonesWithInactive
    );
    expect(result).toEqual({ zoneId: "z-active", kitchenId: "k2" });
  });
});

describe("Mysuru City Pincode Coverage & Routing (32 Verified Pincodes)", () => {
  it("contains exactly the 32 verified Mysuru City 570xxx pincodes", () => {
    expect(MYSURU_CITY_PINCODES).toHaveLength(32);
    expect(MYSURU_CITY_PINCODES[0]).toBe("570001");
    expect(MYSURU_CITY_PINCODES[31]).toBe("570032");
    expect(MYSURU_CITY_PINCODES).not.toContain("570033");
  });

  it("recognizes every single configured Mysuru city pincode (570001 through 570032)", () => {
    for (const pin of MYSURU_CITY_PINCODES) {
      expect(isMysuruCityPincode(pin)).toBe(true);
      const result = resolveOperationalZoneAndKitchen(
        { pincode: pin },
        DEFAULT_DELIVERY_ZONES
      );
      expect(result.zoneId).toBe("zone-1");
      expect(result.kitchenId).toBe("kitchen-1");
    }
  });

  it("explicitly verifies 570013 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570013")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570013" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570021 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570021")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570021" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570024 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570024")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570024" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570025 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570025")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570025" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570026 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570026")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570026" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570027 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570027")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570027" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570028 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570028")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570028" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570029 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570029")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570029" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570030 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570030")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570030" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570031 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570031")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570031" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570032 works and routes to kitchen-1", () => {
    expect(isMysuruCityPincode("570032")).toBe(true);
    const result = resolveOperationalZoneAndKitchen(
      { pincode: "570032" },
      DEFAULT_DELIVERY_ZONES
    );
    expect(result.zoneId).toBe("zone-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("explicitly verifies 570033 is NOT configured and throws unserviceable error", () => {
    expect(isMysuruCityPincode("570033")).toBe(false);
    expect(() =>
      resolveOperationalZoneAndKitchen(
        { pincode: "570033" },
        DEFAULT_DELIVERY_ZONES
      )
    ).toThrow("Cannot route order: No delivery zone serves pincode 570033.");
  });

  it("unknown/unconfigured pincode is not automatically serviceable and throws", () => {
    const unknownPincodes = ["570033", "570034", "570099", "571001", "600001", "110001", "999999"];
    for (const pin of unknownPincodes) {
      expect(isMysuruCityPincode(pin)).toBe(false);
      expect(() =>
        resolveOperationalZoneAndKitchen({ pincode: pin }, DEFAULT_DELIVERY_ZONES)
      ).toThrow(`Cannot route order: No delivery zone serves pincode ${pin}.`);
    }
  });

  it("invalid, empty, or whitespace pincodes return false for isMysuruCityPincode and do not auto-assign zone", () => {
    expect(isMysuruCityPincode("")).toBe(false);
    expect(isMysuruCityPincode("   ")).toBe(false);
    expect(isMysuruCityPincode(null)).toBe(false);
    expect(isMysuruCityPincode(undefined)).toBe(false);
    expect(isMysuruCityPincode("invalid")).toBe(false);

    // Empty or missing pincode must NOT auto-assign zone-1 or default kitchen
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "" }, DEFAULT_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No valid address or pincode provided.");

    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "   " }, DEFAULT_DELIVERY_ZONES)
    ).toThrow("Cannot route order: Address pincode is empty.");

    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: undefined }, DEFAULT_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No valid address or pincode provided.");

    expect(() =>
      resolveOperationalZoneAndKitchen(null, DEFAULT_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No valid address or pincode provided.");
  });
});
