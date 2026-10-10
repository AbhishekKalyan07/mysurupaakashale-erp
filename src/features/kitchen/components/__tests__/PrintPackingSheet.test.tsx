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

  describe("Phase 4B — Special Instructions Checklist & Privacy Guards", () => {
    it("displays special-instructions checklist before area tables when notes exist", async () => {
      const rows: PrintPackingRow[] = [
        {
          orderId: "ord_1",
          displayId: "MP-001",
          area: "Jayalakshmipuram",
          customerName: "Ramesh",
          mealType: "breakfast",
          meal: "Idli, Vada",
          quantity: 2,
          plan: "Basic",
          deliveryPartner: "Partner 1",
          specialInstructions: "Less spicy sambar",
        },
        {
          orderId: "ord_2",
          displayId: "MP-002",
          area: "Jayalakshmipuram",
          customerName: "Suresh",
          mealType: "breakfast",
          meal: "Masala Dose",
          quantity: 1,
          plan: "Regular",
          deliveryPartner: "Partner 2",
          // no notes
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
      });

      const checklistHeading = container!.querySelector("h3");
      expect(checklistHeading).not.toBeNull();
      expect(checklistHeading!.textContent).toContain(
        "Special Instructions Checklist — Breakfast",
      );

      // Verify DOM ordering: checklist heading appears BEFORE area table h2
      const firstAreaHeading = container!.querySelector("h2");
      expect(firstAreaHeading).not.toBeNull();
      expect(firstAreaHeading!.textContent).toBe("Jayalakshmipuram");

      const isChecklistBeforeArea =
        checklistHeading!.compareDocumentPosition(firstAreaHeading!) &
        Node.DOCUMENT_POSITION_FOLLOWING;
      expect(isChecklistBeforeArea).toBeTruthy();
    });

    it("preserves customer display code, dish, quantity, and exact instruction text", async () => {
      const rows: PrintPackingRow[] = [
        {
          orderId: "ord_10",
          displayId: "MP-010",
          area: "Kuvempunagar",
          customerName: "Ananya",
          mealType: "lunch",
          meal: "Special South Meals",
          quantity: 3,
          plan: "Regular",
          deliveryPartner: "Ravi",
          specialInstructions: "Extra rasam, no curd",
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
      });

      const checklist = container!.querySelector("table");
      expect(checklist).not.toBeNull();
      expect(checklist!.textContent).toContain("MP-010");
      expect(checklist!.textContent).toContain("Special South Meals");
      expect(checklist!.textContent).toContain("3");
      expect(checklist!.textContent).toContain("Extra rasam, no curd");
    });

    it("labels customer-specific instructions and menu-level packing notes distinctly", async () => {
      const rows: PrintPackingRow[] = [
        {
          orderId: "ord_both",
          displayId: "MP-088",
          area: "Gokulam",
          customerName: "Bhavana",
          mealType: "dinner",
          meal: "Chapati & Curry",
          quantity: 2,
          plan: "One-Time",
          deliveryPartner: "Mahesh",
          specialInstructions: "Dietary: Less oil on chapatis",
          packingNotes: "Menu note: Pack kurma hot",
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
      });

      const text = container!.textContent!;
      expect(text).toContain("Customer:");
      expect(text).toContain("Dietary: Less oil on chapatis");
      expect(text).toContain("Packing:");
      expect(text).toContain("Menu note: Pack kurma hot");
    });

    it("does not create duplicate checklist entries for orders with both note types", async () => {
      const rows: PrintPackingRow[] = [
        {
          orderId: "ord_single_both",
          displayId: "MP-099",
          area: "Saraswathipuram",
          customerName: "Chidanand",
          mealType: "lunch",
          meal: "Mini Meals",
          quantity: 1,
          plan: "Basic",
          deliveryPartner: "Partner X",
          specialInstructions: "No pickles",
          packingNotes: "Pack buttermilk chilled",
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
      });

      // The checklist table is the first table
      const checklistTable = container!.querySelector("table");
      const rowsInChecklist = checklistTable!.querySelectorAll("tbody tr");
      expect(rowsInChecklist).toHaveLength(1);
    });

    it("omits the checklist cleanly when no notes exist in a meal section", async () => {
      const rowsWithoutNotes: PrintPackingRow[] = [
        {
          orderId: "ord_clean_1",
          displayId: "MP-101",
          area: "Gokulam",
          customerName: "Dinesh",
          mealType: "breakfast",
          meal: "Idli",
          quantity: 2,
          plan: "Basic",
          deliveryPartner: "Partner 1",
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rowsWithoutNotes} />);
      });

      expect(container!.textContent).not.toContain("Special Instructions Checklist");
      expect(container!.querySelector("h3")).toBeNull();
    });

    it("never prints customer phone numbers, full addresses, prices, payment details, or raw UUIDs", async () => {
      const rows: PrintPackingRow[] = [
        {
          orderId: "ord_sec_1",
          displayId: "MP-555",
          area: "Vijayanagar",
          customerName: "Eshwar Rao",
          mealType: "breakfast",
          meal: "Dose",
          quantity: 1,
          plan: "Basic",
          deliveryPartner: "Partner 1",
          specialInstructions: "Crispy dose",
          packingNotes: "Separate chutney",
        },
      ];

      await act(async () => {
        root!.render(<PrintPackingSheet date="2026-10-10" rows={rows} />);
      });

      const text = container!.textContent!;
      // Mandatory privacy exclusions
      expect(text).not.toMatch(/\+91\d{10}/);
      expect(text).not.toMatch(/[6-9]\d{9}/);
      expect(text).not.toContain("₹");
      expect(text).not.toContain("Rs");
      expect(text).not.toContain("INR");
      expect(text).not.toContain("Paid");
      expect(text).not.toContain("Unpaid");
      expect(text).not.toContain("Invoice");
      expect(text).not.toContain("Flat");
      expect(text).not.toContain("Apartment");
      expect(text).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    });
  });
});
