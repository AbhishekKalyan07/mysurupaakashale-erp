import { describe, it, expect } from "vitest";
import { formatCurrency, formatINR } from "../currency";

describe("formatCurrency", () => {
  it("formats standard amounts correctly", () => {
    // Tests behavior of INR formatting
    // Depending on the Node.js version, it might format differently, e.g., '₹100.00' or '₹ 100.00'
    // but the main thing is it formats as INR and uses minimumFractionDigits 0.
    const result = formatCurrency(100);
    expect(result).toMatch(/100/);
    expect(result).toContain("₹");
  });

  it("formats thousands correctly", () => {
    const result = formatCurrency(150000);
    // INR formatting uses 1,50,000 for lakhs
    expect(result).toMatch(/1,50,000/);
  });

  it("formats 0 or falsy correctly", () => {
    expect(formatCurrency(0)).toBe("₹0");
    expect(formatCurrency(NaN)).toBe("₹0");
    expect(formatCurrency(null as any)).toBe("₹0");
    expect(formatCurrency(undefined as any)).toBe("₹0");
  });

  it("formats fractions correctly", () => {
    const result = formatCurrency(150.5);
    expect(result).toMatch(/150\.50?/);
  });
});

describe("formatINR", () => {
  it("formats integer amounts with 2 decimal places", () => {
    const res = formatINR(1500);
    expect(res).toMatch(/1,500\.00/);
    expect(res).toContain("₹");
  });

  it("formats float amounts with 2 decimal places", () => {
    const res = formatINR(1500.5);
    expect(res).toMatch(/1,500\.50/);
    expect(res).toContain("₹");
  });

  it("handles numeric string inputs", () => {
    const res = formatINR("2500");
    expect(res).toMatch(/2,500\.00/);
    expect(res).toContain("₹");
  });

  it("handles missing or invalid values gracefully without returning NaN", () => {
    expect(formatINR(undefined)).toBe("N/A");
    expect(formatINR(null)).toBe("N/A");
    expect(formatINR("")).toBe("N/A");
    expect(formatINR("invalid")).toBe("N/A");
    expect(formatINR(NaN)).toBe("N/A");
  });
});
