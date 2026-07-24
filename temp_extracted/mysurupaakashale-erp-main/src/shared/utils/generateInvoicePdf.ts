import { jsPDF } from 'jspdf';

export interface InvoiceData {
  invoiceNumber: string;
  billingMonth: string; // "2025-07"
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  planName: string;
  planTier: string;
  pricePerDay: number;
  quantity: number;
  totalAmount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  paymentDate: string;
  approvedDate: string;
}

/**
 * Generates a professional PDF invoice for a verified payment.
 * Returns the jsPDF instance (call .output('datauristring') for email,
 * or .save(filename) to download).
 */
export function generateInvoicePdf(data: InvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; // A4 width mm
  const margin = 18;

  // ── Header background ────────────────────────────────────────────────────────
  doc.setFillColor(42, 68, 34); // dark green
  doc.rect(0, 0, W, 40, 'F');

  // ── Brand title ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 243, 220); // warm cream
  doc.text('Mysuru Paakashale', margin, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 190);
  doc.text('Daily Home-Style Meal Delivery Service', margin, 24);
  doc.text('Mysuru, Karnataka | mysuru.paakashale@upi', margin, 30);

  // INVOICE label on top-right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 220, 100);
  doc.text('INVOICE', W - margin, 20, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(200, 220, 190);
  doc.text(`# ${data.invoiceNumber}`, W - margin, 28, { align: 'right' });

  // ── Reset color ──────────────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);

  let y = 52;

  // ── PAID banner ──────────────────────────────────────────────────────────────
  doc.setFillColor(220, 252, 231); // light green
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(margin, y - 5, W - margin * 2, 14, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(21, 128, 61);
  doc.text('✓  PAYMENT VERIFIED', W / 2, y + 4, { align: 'center' });

  y += 18;
  doc.setTextColor(30, 30, 30);

  // ── Two-column meta ─────────────────────────────────────────────────────────
  const colR = W / 2 + 5;

  // Left: Bill To
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('BILL TO', margin, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(data.customerName, margin, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const addrLines = doc.splitTextToSize(data.deliveryAddress, 80);
  doc.text(addrLines, margin, y);
  y += addrLines.length * 4 + 2;
  doc.text(data.customerEmail, margin, y);

  // Right: Invoice meta
  const metaY = y - (addrLines.length * 4 + 2) - 10;
  const metaItems = [
    ['Invoice Date:', data.approvedDate],
    ['Billing Month:', formatBillingMonth(data.billingMonth)],
    ['Payment Date:', data.paymentDate],
    ['Method:', capitalize(data.paymentMethod.replace('_', ' '))],
  ];

  metaItems.forEach(([label, value], i) => {
    const rowY = metaY + i * 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, colR, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(value, W - margin, rowY, { align: 'right' });
  });

  y += 10;

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 210, 190);
  doc.setLineWidth(0.4);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // ── Table header ─────────────────────────────────────────────────────────────
  doc.setFillColor(248, 243, 233);
  doc.rect(margin, y, W - margin * 2, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 80, 40);
  doc.text('DESCRIPTION', margin + 3, y + 5.5);
  doc.text('RATE/DAY', 130, y + 5.5);
  doc.text('DAYS', 155, y + 5.5);
  doc.text('AMOUNT', W - margin - 3, y + 5.5, { align: 'right' });
  y += 10;

  // ── Table row ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(`${data.planName} — ${formatBillingMonth(data.billingMonth)}`, margin + 3, y + 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Daily home-style meals (Qty: ${data.quantity})`, margin + 3, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`₹${data.pricePerDay * data.quantity}`, 130, y + 1);
  doc.text('30', 155, y + 1);
  doc.setFont('helvetica', 'bold');
  doc.text(`₹${data.totalAmount.toLocaleString('en-IN')}`, W - margin - 3, y + 1, { align: 'right' });

  y += 14;

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 210, 190);
  doc.line(margin, y, W - margin, y);
  y += 5;

  // ── Totals block ─────────────────────────────────────────────────────────────
  const totalsX = 140;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Subtotal:', totalsX, y);
  doc.text(`₹${data.totalAmount.toLocaleString('en-IN')}`, W - margin, y, { align: 'right' });
  y += 5;
  doc.text('Tax (GST):', totalsX, y);
  doc.text('Included', W - margin, y, { align: 'right' });
  y += 6;

  doc.setFillColor(42, 68, 34);
  doc.rect(totalsX - 3, y - 2, W - margin - totalsX + 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 243, 220);
  doc.text('Total Paid:', totalsX, y + 5.5);
  doc.text(`₹${data.totalAmount.toLocaleString('en-IN')}`, W - margin - 2, y + 5.5, { align: 'right' });
  y += 14;

  // ── Reference number if any ──────────────────────────────────────────────────
  if (data.referenceNumber) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Transaction Reference: ${data.referenceNumber}`, margin, y);
    y += 8;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFillColor(248, 243, 233);
  doc.rect(0, 270, W, 27, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 80, 40);
  doc.text('Thank you for choosing Mysuru Paakashale!', W / 2, 278, { align: 'center' });
  doc.text('For support: mysuru.paakashale@gmail.com  |  This is a system-generated invoice.', W / 2, 284, { align: 'center' });
  doc.setTextColor(160, 140, 110);
  doc.text('Mysuru Paakashale, Mysuru, Karnataka, India', W / 2, 290, { align: 'center' });

  return doc;
}

function formatBillingMonth(month: string): string {
  // "2025-07" → "July 2025"
  try {
    const [year, mo] = month.split('-');
    return new Date(parseInt(year), parseInt(mo) - 1, 1).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return month;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
