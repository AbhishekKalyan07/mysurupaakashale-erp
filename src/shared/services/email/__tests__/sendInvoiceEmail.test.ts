import { describe, it, expect, vi, beforeEach } from 'vitest';
import emailjs from '@emailjs/browser';
import { sendInvoiceEmail } from '../sendInvoiceEmail';

vi.mock('@emailjs/browser', () => ({
  default: {
    send: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('sendInvoiceEmail', () => {
  const payload = {
    toEmail: 'test@example.com',
    toName: 'Test Customer',
    planName: 'Regular Plan',
    billingMonth: 'August 2026',
    totalAmount: 1500,
    invoiceNumber: 'INV-001',
    paymentMethod: 'UPI',
    pdfBase64: 'dummy-base64'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips sending if emailjs config is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // When config is missing (VITE_ variables are empty by default in tests without setup)
    await sendInvoiceEmail(payload);
    expect(warnSpy).toHaveBeenCalledWith('[sendInvoiceEmail] EmailJS not configured — skipping email send.');
    expect(emailjs.send).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
