import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? '';
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? '';
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? '';

export interface InvoiceEmailPayload {
  toEmail: string;
  toName: string;
  planName: string;
  billingMonth: string; // "July 2025"
  totalAmount: number;
  invoiceNumber: string;
  paymentMethod: string;
  /** base64-encoded PDF string (data URI without the prefix) */
  pdfBase64: string;
}

/**
 * Sends an invoice email to the customer via EmailJS.
 *
 * Setup required:
 *  1. Create a free account at https://emailjs.com
 *  2. Add a Gmail (or any) email service
 *  3. Create a template with these variables:
 *       {{to_name}}, {{to_email}}, {{plan_name}}, {{billing_month}},
 *       {{total_amount}}, {{invoice_number}}, {{payment_method}}
 *  4. Set in .env:
 *       VITE_EMAILJS_SERVICE_ID=service_xxxxx
 *       VITE_EMAILJS_TEMPLATE_ID=template_xxxxx
 *       VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxx
 */
export async function sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('[sendInvoiceEmail] EmailJS not configured — skipping email send.');
    return;
  }

  await emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    {
      to_name: payload.toName,
      to_email: payload.toEmail,
      plan_name: payload.planName,
      billing_month: payload.billingMonth,
      total_amount: `₹${payload.totalAmount.toLocaleString('en-IN')}`,
      invoice_number: payload.invoiceNumber,
      payment_method: payload.paymentMethod,
    },
    { publicKey: PUBLIC_KEY },
  );
}
