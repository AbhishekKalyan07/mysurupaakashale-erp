import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DeliveryDispatchTable } from "../DeliveryDispatchTable";
import type { CustomerProfile, Order } from "@/shared/types";
import type { DeliveryPartnerGroup } from "@/shared/services/business/deliveryService";

// Mock OrderCard to inspect rendered props and destination URLs in the test DOM
let lastOrderCardProps: any = null;
vi.mock("@/shared/components/ui/OrderCard", () => ({
  OrderCard: (props: any) => {
    lastOrderCardProps = props;
    const { order, customer } = props;
    const addressCoords = customer?.addressCoords;
    const address = customer?.address;
    return (
      <div data-testid={`order-card-${order.id}`}>
        <span data-testid="customer-name">{customer?.fullName}</span>
        <span data-testid="customer-display-id">{customer?.displayId}</span>
        <span data-testid="customer-phone">{customer?.phone}</span>
        {(addressCoords || address) && (
          <a
            data-testid="map-destination"
            href={
              addressCoords
                ? `https://maps.google.com/?q=${addressCoords.lat},${addressCoords.lng}`
                : `https://maps.google.com/?q=${encodeURIComponent(address!)}`
            }
          >
            Navigate
          </a>
        )}
      </div>
    );
  },
}));

function createMockCustomer(
  id: string,
  overrides: Partial<CustomerProfile> = {},
): CustomerProfile {
  return {
    id,
    role: "customer",
    fullName: "Ramesh Kumar",
    displayId: "MP-101",
    email: "ramesh@example.com",
    phone: "+91 98765 43210",
    photoUrl: null,
    isActive: true,
    createdAt: { seconds: 1700000000, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1700000000, nanoseconds: 0 } as any,
    defaultAddressId: "addr_1",
    addresses: [
      {
        id: "addr_1",
        label: "Home",
        line1: "123 Saraswathipuram",
        city: "Mysuru",
        state: "Karnataka",
        lat: 12.3051,
        lng: 76.6385,
        isDefault: true,
      },
    ],
    ...overrides,
  };
}

function createMockOrder(
  id: string,
  customerId: string,
  overrides: Partial<Order> = {},
): Order {
  return {
    id,
    source: "subscription",
    customerId,
    subscriptionId: "sub_1",
    planTier: "standard",
    mealType: "lunch",
    date: "2026-10-24",
    status: "scheduled",
    deliveryAddressId: "addr_1",
    zoneId: "zone_1",
    kitchenId: "kitchen_1",
    deliveryPartnerId: "dp_1",
    deliveryWindow: null,
    paymentId: null,
    itemsLabel: "Full South Indian Thali",
    selectedOptionId: null,
    price: 120,
    currency: "INR",
    createdAt: { seconds: 1700000000, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1700000000, nanoseconds: 0 } as any,
    ...overrides,
  };
}

function createMockGroups(orders: Order[]): DeliveryPartnerGroup[] {
  return [
    {
      partnerName: "Suresh Driver",
      areas: [
        {
          areaName: "Saraswathipuram",
          orders,
        },
      ],
    },
  ];
}

describe("DeliveryDispatchTable Component", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    lastOrderCardProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container!);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    lastOrderCardProps = null;
  });

  it("renders empty state when groupedOrders is empty", async () => {
    const customerMap = new Map<string, CustomerProfile>();
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={[]}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(container!.textContent).toContain("No assigned orders to display.");
  });

  it("resolves customer phone and displayId from CustomerProfile fallback when order has no denormalized phone", async () => {
    const customer = createMockCustomer("cust_1", {
      fullName: "Ananya Sharma",
      phone: "+91 91234 56789",
      displayId: "MP-202",
    });
    const order = createMockOrder("ord_1", "cust_1", {
      customerName: undefined,
      customerPhone: undefined,
      customerCode: undefined,
    });
    const customerMap = new Map<string, CustomerProfile>([
      ["cust_1", customer],
    ]);
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([order])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    const phoneEl = container!.querySelector('[data-testid="customer-phone"]');
    expect(phoneEl?.textContent).toBe("+91 91234 56789");
    expect(lastOrderCardProps.customer.fullName).toBe("Ananya Sharma");
    expect(lastOrderCardProps.customer.displayId).toBe("MP-202");
  });

  it("falls back to CustomerProfile address coordinates when order.addressCoords is absent or null", async () => {
    const customer = createMockCustomer("cust_2", {
      addresses: [
        {
          id: "addr_99",
          label: "Office",
          line1: "Infosys Campus",
          city: "Mysuru",
          state: "Karnataka",
          lat: 12.3556,
          lng: 76.5982,
          isDefault: true,
        },
      ],
    });
    const order = createMockOrder("ord_2", "cust_2", {
      addressCoords: null,
      deliveryAddressId: "addr_99",
    });
    const customerMap = new Map<string, CustomerProfile>([
      ["cust_2", customer],
    ]);
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([order])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(lastOrderCardProps.customer.addressCoords).toEqual({
      lat: 12.3556,
      lng: 76.5982,
    });
    const mapLink = container!.querySelector(
      '[data-testid="map-destination"]',
    ) as HTMLAnchorElement;
    expect(mapLink.href).toBe("https://maps.google.com/?q=12.3556,76.5982");
  });

  it("prioritizes existing order.addressCoords over CustomerProfile address coordinates", async () => {
    const customer = createMockCustomer("cust_3", {
      addresses: [
        {
          id: "addr_1",
          label: "Home",
          line1: "Old Address",
          city: "Mysuru",
          state: "Karnataka",
          lat: 12.1111,
          lng: 76.1111,
          isDefault: true,
        },
      ],
    });
    const order = createMockOrder("ord_3", "cust_3", {
      addressCoords: { lat: 12.9999, lng: 76.9999 },
      deliveryAddressId: "addr_1",
    });
    const customerMap = new Map<string, CustomerProfile>([
      ["cust_3", customer],
    ]);
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([order])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(lastOrderCardProps.customer.addressCoords).toEqual({
      lat: 12.9999,
      lng: 76.9999,
    });
    const mapLink = container!.querySelector(
      '[data-testid="map-destination"]',
    ) as HTMLAnchorElement;
    expect(mapLink.href).toBe("https://maps.google.com/?q=12.9999,76.9999");
  });

  it("treats legitimate numeric zero coordinates (lat: 0, lng: 0) as valid and not missing", async () => {
    const customer = createMockCustomer("cust_zero", {
      addresses: [
        {
          id: "addr_zero",
          label: "Equator Prime",
          line1: "Null Island",
          city: "Mysuru Test",
          state: "Karnataka",
          lat: 0,
          lng: 0,
          isDefault: true,
        },
      ],
    });
    const order = createMockOrder("ord_zero", "cust_zero", {
      addressCoords: null,
      deliveryAddressId: "addr_zero",
    });
    const customerMap = new Map<string, CustomerProfile>([
      ["cust_zero", customer],
    ]);
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([order])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(lastOrderCardProps.customer.addressCoords).toEqual({
      lat: 0,
      lng: 0,
    });
    const mapLink = container!.querySelector(
      '[data-testid="map-destination"]',
    ) as HTMLAnchorElement;
    expect(mapLink.href).toBe("https://maps.google.com/?q=0,0");
  });

  it("gracefully falls back to 'Unknown Customer' and null coords when customer profile is missing", async () => {
    const order = createMockOrder("ord_4", "cust_missing", {
      customerName: undefined,
      customerPhone: undefined,
      addressCoords: null,
      deliveryAddressId: "addr_nonexistent",
    });
    const customerMap = new Map<string, CustomerProfile>(); // empty map
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([order])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(lastOrderCardProps.customer.fullName).toBe("Unknown Customer");
    expect(lastOrderCardProps.customer.phone).toBeUndefined();
    expect(lastOrderCardProps.customer.addressCoords).toBeNull();
  });

  it("handles missing deliveryAddressId or incomplete coordinates without throwing exceptions", async () => {
    const customer = createMockCustomer("cust_incomplete", {
      addresses: [
        {
          id: "addr_incomplete",
          label: "Ungeocoded",
          line1: "New Layout",
          city: "Mysuru",
          state: "Karnataka",
          lat: null,
          lng: null,
          isDefault: true,
        },
      ],
    });
    const orderWithoutAddressId = createMockOrder("ord_5", "cust_incomplete", {
      deliveryAddressId: "" as any,
      addressCoords: null,
    });
    const orderWithUngeocodedAddress = createMockOrder(
      "ord_6",
      "cust_incomplete",
      {
        deliveryAddressId: "addr_incomplete",
        addressCoords: null,
      },
    );

    const customerMap = new Map<string, CustomerProfile>([
      ["cust_incomplete", customer],
    ]);
    const onReassign = vi.fn();

    await act(async () => {
      root!.render(
        <DeliveryDispatchTable
          groupedOrders={createMockGroups([
            orderWithoutAddressId,
            orderWithUngeocodedAddress,
          ])}
          customerMap={customerMap}
          onReassign={onReassign}
          partners={[]}
        />,
      );
    });

    expect(lastOrderCardProps.customer.addressCoords).toBeNull();
  });

  it("enforces type-level contract requiring Map<string, CustomerProfile>", () => {
    type TableProps = React.ComponentProps<typeof DeliveryDispatchTable>;
    // Valid assignment passes type check:
    const validMap: TableProps["customerMap"] = new Map<
      string,
      CustomerProfile
    >();
    expect(validMap).toBeInstanceOf(Map);

    // Negative compile-time check: Map<string, string> must fail typecheck:
    // @ts-expect-error Type 'Map<string, string>' is not assignable to type 'Map<string, CustomerProfile>'.
    const _invalidMap: TableProps["customerMap"] = new Map<string, string>();
    expect(_invalidMap).toBeDefined();
  });
});
