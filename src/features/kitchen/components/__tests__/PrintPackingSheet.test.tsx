import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PrintPackingSheet } from "../PrintPackingSheet";
import type { PrintPackingRow } from "@/shared/services/business/productionService";

describe("PrintPackingSheet", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
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
  });

  it("renders 'No orders for today' when rows is empty", async () => {
    await act(async () => {
      root!.render(<PrintPackingSheet date="2026-10-10" rows={[]} />);
    });

    expect(container!.textContent).toContain("No orders for today.");
    expect(container!.textContent).toContain("Kitchen Packing Sheet");
  });

  it("groups dish labels like 'Idli, Vada (2 pcs)' under Breakfast while preserving dish text", async () => {
    const rows: PrintPackingRow[] = [
      {
        orderId: "ord_1",
        displayId: "MP-001",
        area: "Kuvempunagar",
        customerName: "Ananya Sharma",
        mealType: "breakfast",
        meal: "Idli, Vada (2 pcs)",
        quantity: 2,
        plan: "Basic",
        deliveryPartner: "Ravi Kumar",
        specialInstructions: "Less spicy sambar",
        packingNotes: "Pack chutney separately",
      },
    ];

    await act(async () => {
      root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
    });

    // Does NOT say No orders for today
    expect(container!.textContent).not.toContain("No orders for today.");

    // Section header is Breakfast
    expect(container!.textContent).toContain("Breakfast Packing Sheet");

    // Area header
    expect(container!.textContent).toContain("Kuvempunagar");

    // Preserved fields
    expect(container!.textContent).toContain("MP-001");
    expect(container!.textContent).toContain("Ananya Sharma");
    expect(container!.textContent).toContain("2"); // Qty
    expect(container!.textContent).toContain("Basic"); // Plan
    expect(container!.textContent).toContain("Idli, Vada (2 pcs)"); // Dish label
    expect(container!.textContent).toContain("Ravi Kumar"); // Delivery partner
    expect(container!.textContent).toContain("Less spicy sambar");
    expect(container!.textContent).toContain("Pack chutney separately");
  });

  it("renders Lunch-only data without showing 'No orders for today'", async () => {
    const rows: PrintPackingRow[] = [
      {
        orderId: "ord_lunch_1",
        displayId: "MP-042",
        area: "Gokulam",
        customerName: "Vikram Seth",
        mealType: "lunch",
        meal: "South Indian Thali",
        quantity: 1,
        plan: "Regular",
        deliveryPartner: "Mahesh",
      },
    ];

    await act(async () => {
      root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
    });

    expect(container!.textContent).not.toContain("No orders for today.");
    expect(container!.textContent).toContain("Lunch Packing Sheet");
    expect(container!.textContent).not.toContain("Breakfast Packing Sheet");
    expect(container!.textContent).not.toContain("Dinner Packing Sheet");
    expect(container!.textContent).toContain("Gokulam");
    expect(container!.textContent).toContain("MP-042");
    expect(container!.textContent).toContain("Vikram Seth");
    expect(container!.textContent).toContain("South Indian Thali");
  });

  it("creates distinct sections for Breakfast, Lunch, and Dinner when all are present", async () => {
    const rows: PrintPackingRow[] = [
      {
        orderId: "b1",
        displayId: "MP-101",
        area: "Jayalakshmipuram",
        customerName: "Customer B",
        mealType: "breakfast",
        meal: "Khara Bath & Kesari Bath",
        quantity: 1,
        plan: "Basic",
        deliveryPartner: "Partner B",
      },
      {
        orderId: "l1",
        displayId: "MP-102",
        area: "Jayalakshmipuram",
        customerName: "Customer L",
        mealType: "lunch",
        meal: "Full Meals",
        quantity: 3,
        plan: "Regular",
        deliveryPartner: "Partner L",
      },
      {
        orderId: "d1",
        displayId: "MP-103",
        area: "Saraswathipuram",
        customerName: "Customer D",
        mealType: "dinner",
        meal: "Chapati & Veg Kurma",
        quantity: 2,
        plan: "One-Time",
        deliveryPartner: "Partner D",
      },
    ];

    await act(async () => {
      root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
    });

    expect(container!.textContent).toContain("Breakfast Packing Sheet");
    expect(container!.textContent).toContain("Lunch Packing Sheet");
    expect(container!.textContent).toContain("Dinner Packing Sheet");

    // Area grouping
    expect(container!.textContent).toContain("Jayalakshmipuram");
    expect(container!.textContent).toContain("Saraswathipuram");

    // All dish labels present
    expect(container!.textContent).toContain("Khara Bath & Kesari Bath");
    expect(container!.textContent).toContain("Full Meals");
    expect(container!.textContent).toContain("Chapati & Veg Kurma");
  });

  it("preserves area grouping within each meal section and sorts areas alphabetically", async () => {
    const rows: PrintPackingRow[] = [
      {
        orderId: "ord_z",
        displayId: "MP-201",
        area: "Vijayanagar",
        customerName: "Zoya",
        mealType: "dinner",
        meal: "Roti Curry",
        quantity: 1,
        plan: "Basic",
        deliveryPartner: "Partner 1",
      },
      {
        orderId: "ord_a",
        displayId: "MP-202",
        area: "Alanahalli",
        customerName: "Amit",
        mealType: "dinner",
        meal: "Roti Curry",
        quantity: 2,
        plan: "Regular",
        deliveryPartner: "Partner 2",
      },
    ];

    await act(async () => {
      root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
    });

    const areaHeaders = Array.from(container!.querySelectorAll("h2")).map(
      (h) => h.textContent,
    );
    expect(areaHeaders).toEqual(["Alanahalli", "Vijayanagar"]);
  });
});
