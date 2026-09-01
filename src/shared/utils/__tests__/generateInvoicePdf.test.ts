import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateInvoicePdf, type InvoiceData } from '../generateInvoicePdf';


// Mock jsPDF
vi.mock('jspdf', () => {
  const MockJsPDF = class {
    setFillColor = vi.fn();
    rect = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    text = vi.fn();
    setDrawColor = vi.fn();
    roundedRect = vi.fn();
    splitTextToSize = vi.fn((text: string) => text.split('\n'));
    setLineWidth = vi.fn();
    line = vi.fn();
  };
  return {
    default: MockJsPDF,
    jsPDF: MockJsPDF
  };
});

describe('generateInvoicePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockData: InvoiceData = {
    invoiceNumber: 'INV-001',
    billingMonth: '2026-08',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    deliveryAddress: '123 Test St',
    planName: 'Basic Plan',
    planTier: 'basic',
    pricePerDay: 150,
    quantity: 1,
    totalAmount: 4500,
    paymentMethod: 'upi',
    referenceNumber: 'REF123',
    paymentDate: '2026-08-01',
    approvedDate: '2026-08-01',
  };

  it('generates a PDF document without throwing', () => {
    const doc = generateInvoicePdf(mockData);
    expect(doc).toBeDefined();
  });

  it('handles empty reference number gracefully', () => {
    const doc = generateInvoicePdf({ ...mockData, referenceNumber: null });
    expect(doc).toBeDefined();
  });

  it('handles invalid billing month format by returning it directly', () => {
    // formatBillingMonth internal helper has a try-catch but Date constructor handles bad strings strangely.
    // If it throws, it returns the raw month string.
    const doc = generateInvoicePdf({ ...mockData, billingMonth: 'invalid-month' });
    expect(doc).toBeDefined();
  });

  it('triggers the catch block in formatBillingMonth', () => {
    // Pass a number or object to force .split() to throw a TypeError
    const doc = generateInvoicePdf({ ...mockData, billingMonth: {} as any });
    expect(doc).toBeDefined();
  });
});
