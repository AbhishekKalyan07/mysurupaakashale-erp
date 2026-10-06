import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateInvoicePdf,
  formatInvoicePdfFilename,
  type InvoiceData,
} from "../generateInvoicePdf";

// Mock jsPDF
vi.mock("jspdf", () => {
  const MockJsPDF = class {
    setFillColor = vi.fn();
    rect = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    text = vi.fn();
    setDrawColor = vi.fn();
    roundedRect = vi.fn();
    splitTextToSize = vi.fn((text: string) => text.split("\n"));
    setLineWidth = vi.fn();
    line = vi.fn();
  };
  return {
    default: MockJsPDF,
    jsPDF: MockJsPDF,
  };
});

describe("generateInvoicePdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockData: InvoiceData = {
    invoiceNumber: "INV-001",
    billingMonth: "2026-08",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    deliveryAddress: "123 Test St",
    planName: "Basic Plan",
    planTier: "basic",
    pricePerDay: 150,
    quantity: 1,
    totalAmount: 4500,
    paymentMethod: "upi",
    referenceNumber: "REF123",
    paymentDate: "2026-08-01",
    approvedDate: "2026-08-01",
  };

  it("generates a PDF document without throwing", () => {
    const doc = generateInvoicePdf(mockData);
    expect(doc).toBeDefined();
  });

  it("handles empty reference number gracefully", () => {
    const doc = generateInvoicePdf({ ...mockData, referenceNumber: null });
    expect(doc).toBeDefined();
  });

  it("handles invalid billing month format by returning it directly", () => {
    // formatBillingMonth internal helper has a try-catch but Date constructor handles bad strings strangely.
    // If it throws, it returns the raw month string.
    const doc = generateInvoicePdf({
      ...mockData,
      billingMonth: "invalid-month",
    });
    expect(doc).toBeDefined();
  });

  it("triggers the catch block in formatBillingMonth", () => {
    // Pass a number or object to force .split() to throw a TypeError
    const doc = generateInvoicePdf({ ...mockData, billingMonth: {} as any });
    expect(doc).toBeDefined();
  });

  it("applies custom companyProfile branding when provided with phone", () => {
    const doc = generateInvoicePdf(mockData, {
      name: "Custom Paakashale",
      tagline: "Finest Meals",
      supportEmail: "custom@paakashale.in",
      supportPhone: "+91 99999 88888",
      address: "Jayalakshmipuram, Mysuru",
    });
    expect(doc).toBeDefined();
    expect(doc.text).toHaveBeenCalledWith("Tel: +91 99999 88888", 18, 30);
  });

  it("applies custom companyProfile branding without phone using email directly", () => {
    const doc = generateInvoicePdf(mockData, {
      name: "Custom Paakashale",
      tagline: "Finest Meals",
      supportEmail: "custom@paakashale.in",
      address: "Bengaluru, Karnataka",
    });
    expect(doc).toBeDefined();
    expect(doc.text).toHaveBeenCalledWith("custom@paakashale.in", 18, 30);
  });

  it("uses default Mysuru branding subline when companyProfile is omitted", () => {
    const doc = generateInvoicePdf(mockData);
    expect(doc).toBeDefined();
    expect(doc.text).toHaveBeenCalledWith(
      "Mysuru, Karnataka | mysuru.paakashale@upi",
      18,
      30,
    );
  });
});

describe("formatInvoicePdfFilename", () => {
  it("formats normal customer name, display ID, and invoice number correctly", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "Rahul Kumar",
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-Rahul-Kumar-MP-001-INV-1791224487773.pdf");
  });

  it("safely handles and collapses whitespace in customer name", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "  Rahul   Kumar  ",
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-Rahul-Kumar-MP-001-INV-1791224487773.pdf");
  });

  it("sanitizes punctuation and filesystem-unsafe special characters", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "Rahul K. / Kumar (O'Connor) #1 & Co.",
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe(
      "Invoice-Rahul-K-Kumar-O-Connor-1-Co-MP-001-INV-1791224487773.pdf",
    );
  });

  it("handles missing customer name gracefully without double hyphens", () => {
    const filename = formatInvoicePdfFilename({
      customerName: null,
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-MP-001-INV-1791224487773.pdf");
  });

  it("handles empty string customer name gracefully", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "   ",
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-MP-001-INV-1791224487773.pdf");
  });

  it("handles missing display ID gracefully", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "Rahul Kumar",
      customerDisplayId: null,
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-Rahul-Kumar-INV-1791224487773.pdf");
  });

  it("handles both missing customer name and display ID", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "",
      customerDisplayId: "",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).toBe("Invoice-INV-1791224487773.pdf");
  });

  it("preserves real invoice number exactly", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "Priya Sharma",
      customerDisplayId: "MP-042",
      invoiceNumber: "INV-CUSTOM-2026-9999",
    });
    expect(filename).toBe(
      "Invoice-Priya-Sharma-MP-042-INV-CUSTOM-2026-9999.pdf",
    );
  });

  it("never includes private data like email, phone or raw UIDs", () => {
    const filename = formatInvoicePdfFilename({
      customerName: "Rahul Kumar",
      customerDisplayId: "MP-001",
      invoiceNumber: "INV-1791224487773",
    });
    expect(filename).not.toContain("@");
    expect(filename).not.toContain("9876543210");
    expect(filename).not.toMatch(/[a-z0-9]{28}/); // No raw Firebase UID
    expect(filename).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/); // No raw UUID
  });
});
