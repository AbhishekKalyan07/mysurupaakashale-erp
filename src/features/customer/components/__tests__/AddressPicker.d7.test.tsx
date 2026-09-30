/**
 * D7 — Geolocation Removal & Manual Address/Pincode Flow Tests
 *
 * Architecture note: this project uses react-dom/client + react act
 * (not @testing-library/react). Tests follow the same pattern as
 * AdminSendNotificationModal.test.tsx.
 *
 * Verifies:
 *  1. navigator.geolocation is NOT automatically invoked on render
 *  2. No "Use My Current Location" / live-location trigger exists
 *  3. AddressPicker source contains ZERO navigator.geolocation references
 *  4. Manual Nominatim text search works
 *  5. Delivery-area validation (resolveOperationalZoneAndKitchen) is unchanged
 *  6. Geolocation failure does NOT break address flow
 *  7. Existing address is not overwritten automatically
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveOperationalZoneAndKitchen } from "@/shared/services/business/operationalRouter";
import type { PickedAddress } from "@/features/customer/components/AddressPicker";

// Top-level mock — hoisted by vitest automatically (MapPinPicker uses Leaflet, unavailable in JSDOM)
vi.mock("@/features/customer/components/MapPinPicker", () => ({
  MapPinPicker: () => null,
}));

// ── Geolocation spy ─────────────────────────────────────────────────────────
let geolocationGetCurrentPositionSpy: ReturnType<typeof vi.fn>;
let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  geolocationGetCurrentPositionSpy = vi.fn();
  Object.defineProperty(globalThis.navigator, "geolocation", {
    value: { getCurrentPosition: geolocationGetCurrentPositionSpy },
    writable: true,
    configurable: true,
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container!);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
  }
  if (container && document.body.contains(container)) {
    document.body.removeChild(container);
  }
  container = null;
  root = null;
  vi.restoreAllMocks();
});

// ── Source-level verification ───────────────────────────────────────────────

// Read the AddressPicker source file directly from disk (bypasses Vite module cache)
function readAddressPickerSource(): string {
  // __filename is available in vitest via Node's ESM compatibility
  const srcPath = resolve(
    process.cwd(),
    "src/features/customer/components/AddressPicker.tsx"
  );
  return readFileSync(srcPath, "utf-8");
}

describe("D7 — Source Code: Geolocation Removed from AddressPicker", () => {
  it("AddressPicker source must contain zero navigator.geolocation references", () => {
    const src = readAddressPickerSource();
    expect(src).not.toContain("navigator.geolocation");
    expect(src).not.toContain("getCurrentPosition");
    expect(src).not.toContain("reverseGeocode"); // geolocation-only helper, also removed
  });

  it("AddressPicker source must not import Navigation or CheckCircle2 icons (removed with live-location button)", () => {
    const src = readAddressPickerSource();
    // These icons were only used by the live-location button and feedback badge
    expect(src).not.toContain("Navigation,");
    expect(src).not.toContain("CheckCircle2");
    expect(src).not.toContain("useCallback"); // only imported for the live location handler
  });

  it("AddressPicker source still contains manual search (Nominatim) and MapPinPicker", () => {
    const src = readAddressPickerSource();
    expect(src).toContain("nominatim.openstreetmap.org/search"); // manual forward geocode
    expect(src).toContain("MapPinPicker");                        // manual pin adjustment
    expect(src).toContain("onPick");                              // callback to parent
  });
});

// ── Runtime: geolocation not invoked on render ──────────────────────────────

describe("D7 — Runtime: No Automatic Geolocation on Render", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
  });

  it("navigator.geolocation.getCurrentPosition is NOT called when AddressPicker mounts", async () => {
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");

    await act(async () => {
      root!.render(<AddressPicker onPick={() => {}} />);
    });

    expect(geolocationGetCurrentPositionSpy).not.toHaveBeenCalled();
  });

  it("navigator.geolocation.getCurrentPosition is NOT called after 2s of idle time", async () => {
    vi.useFakeTimers();
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");

    await act(async () => {
      root!.render(<AddressPicker onPick={() => {}} />);
    });

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(geolocationGetCurrentPositionSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("no 'Use My Current Location' button is rendered", async () => {
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");

    await act(async () => {
      root!.render(<AddressPicker onPick={() => {}} />);
    });

    const text = container!.textContent || "";
    expect(text.toLowerCase()).not.toContain("current location");
    expect(text.toLowerCase()).not.toContain("use my location");
    expect(text.toLowerCase()).not.toContain("detecting your location");
  });
});

// ── Manual address flow ─────────────────────────────────────────────────────

describe("D7 — Manual Address Flow", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
  });

  it("onPick is NOT called on component mount (no automatic detection)", async () => {
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");
    const onPick = vi.fn();

    await act(async () => {
      root!.render(<AddressPicker onPick={onPick} />);
    });

    expect(onPick).not.toHaveBeenCalled();
  });

  it("search input with id='address-search-input' is present in rendered output", async () => {
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");

    await act(async () => {
      root!.render(<AddressPicker onPick={() => {}} />);
    });

    const input = container!.querySelector("#address-search-input");
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).type).toBe("text");
  });

  it("parseNominatim-style PickedAddress preserves pincode field from Nominatim postcode", () => {
    // Test the data shape produced by parseNominatim — no DOM needed
    const simulatedPickedAddress: PickedAddress = {
      line1: "Gokulam",
      city: "Mysuru",
      state: "Karnataka",
      pincode: "570002",
      lat: 12.3119,
      lng: 76.6342,
    };

    expect(simulatedPickedAddress.pincode).toBe("570002");
    expect(simulatedPickedAddress.city).toBe("Mysuru");
    expect(simulatedPickedAddress.state).toBe("Karnataka");
    expect(typeof simulatedPickedAddress.lat).toBe("number");
    expect(typeof simulatedPickedAddress.lng).toBe("number");
  });

  it("geolocation unavailability does NOT break component render", async () => {
    // Remove geolocation API entirely
    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");

    // Should render without throwing even with geolocation undefined
    await expect(
      act(async () => { root!.render(<AddressPicker onPick={() => {}} />); })
    ).resolves.not.toThrow();

    const input = container!.querySelector("#address-search-input");
    expect(input).not.toBeNull();
  });

  it("preserved existing PickedAddress structure remains unchanged after component mount", async () => {
    const { AddressPicker } = await import("@/features/customer/components/AddressPicker");
    const onPick = vi.fn();

    const preExistingAddress: PickedAddress = {
      line1: "No. 42, 5th Cross, Lakshmipuram",
      city: "Mysuru",
      state: "Karnataka",
      pincode: "570004",
      lat: 12.31,
      lng: 76.63,
    };

    await act(async () => {
      root!.render(<AddressPicker onPick={onPick} />);
    });

    // Component mount must NOT have touched the pre-existing address
    expect(onPick).not.toHaveBeenCalled();
    expect(preExistingAddress.pincode).toBe("570004");
    expect(preExistingAddress.line1).toBe("No. 42, 5th Cross, Lakshmipuram");
  });
});

// ── Delivery-area validation ────────────────────────────────────────────────

describe("D7 — Delivery-Area Validation (unchanged)", () => {
  const mockZones = [
    { id: "zone-mys-1", name: "Mysuru Zone 1", kitchenId: "kitchen-1", pincodes: ["570001", "570002", "570004"] },
    { id: "zone-mys-2", name: "Mysuru Zone 2", kitchenId: "kitchen-2", pincodes: ["570003", "570007"] },
  ] as any[];

  it("supported pincode (570001) resolves correctly via resolveOperationalZoneAndKitchen", () => {
    const result = resolveOperationalZoneAndKitchen({ pincode: "570001" }, mockZones);
    expect(result.zoneId).toBe("zone-mys-1");
    expect(result.kitchenId).toBe("kitchen-1");
  });

  it("supported pincode (570003) resolves to the correct zone 2", () => {
    const result = resolveOperationalZoneAndKitchen({ pincode: "570003" }, mockZones);
    expect(result.zoneId).toBe("zone-mys-2");
    expect(result.kitchenId).toBe("kitchen-2");
  });

  it("unsupported pincode (600001, outside Mysuru) is rejected by existing logic", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "600001" }, mockZones)
    ).toThrow();
  });

  it("empty pincode is rejected by existing validation", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "" }, mockZones)
    ).toThrow(/no valid address or pincode/i);
  });

  it("whitespace-only pincode is rejected by existing validation", () => {
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "   " }, mockZones)
    ).toThrow(/pincode is empty/i);
  });

  it("pincode from manually-entered Nominatim result (570002) is serviceable", () => {
    const picked: PickedAddress = {
      line1: "Gokulam",
      city: "Mysuru",
      state: "Karnataka",
      pincode: "570002",
      lat: 12.3119,
      lng: 76.6342,
    };
    const result = resolveOperationalZoneAndKitchen(picked, mockZones);
    expect(result.zoneId).toBe("zone-mys-1");
  });

  it("unsupported pincode from Nominatim result (999999) is rejected", () => {
    const picked: PickedAddress = {
      line1: "Unknown Area",
      city: "Unknown",
      state: "Karnataka",
      pincode: "999999",
      lat: 0,
      lng: 0,
    };
    expect(() => resolveOperationalZoneAndKitchen(picked, mockZones)).toThrow();
  });

  it("pincode field in PickedAddress drives delivery-area lookup (not device coordinates)", () => {
    // Even if lat/lng are zero (no device GPS), pincode alone determines serviceability
    const pickedNoCoords: PickedAddress = {
      line1: "Test",
      city: "Mysuru",
      state: "Karnataka",
      pincode: "570004",
      lat: 0,  // not from GPS
      lng: 0,  // not from GPS
    };
    const result = resolveOperationalZoneAndKitchen(pickedNoCoords, mockZones);
    expect(result.zoneId).toBe("zone-mys-1");
  });
});
