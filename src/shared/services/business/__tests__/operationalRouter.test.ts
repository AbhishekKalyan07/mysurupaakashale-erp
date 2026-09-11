import { describe, it, expect } from "vitest";
import { resolveOperationalZoneAndKitchen } from "../operationalRouter";

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
});
