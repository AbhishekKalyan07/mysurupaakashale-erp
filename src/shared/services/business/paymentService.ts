import { Timestamp } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { runTransaction, doc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { ManualPayment, SubmitPaymentInput } from '@/shared/types';
import { paymentRepository } from '../firestore/paymentRepository';
import { userRepository } from '../firestore/userRepository';
import { notifyPaymentSubmitted } from '../firestore/notificationService';
import { generateInvoicePdf, type InvoiceData } from '@/shared/utils/generateInvoicePdf';
import { sendInvoiceEmail } from '@/shared/services/email/sendInvoiceEmail';

class PaymentService {
  /**
   * Submit a new payment for a subscription.
   * Stores screenshotUrl and billingMonth alongside the payment.
   */
  async submitPayment(
    input: SubmitPaymentInput,
    customerId: string,
    customerName: string,
  ): Promise<string> {
    const billingMonth =
      input.billingMonth ?? new Date().toISOString().slice(0, 7); // fallback: "YYYY-MM"

    const paymentId = await paymentRepository.create({
      subscriptionId: input.subscriptionId,
      customerId,
      customerName,
      amount: input.amount,
      currency: 'INR',
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      paymentDate: input.paymentDate || new Date().toISOString().split('T')[0],
      screenshotUrl: input.screenshotUrl ?? null,
      billingMonth,
      status: 'pending',
      verificationDate: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    });

    try {
      const admins = await userRepository.list(where('role', '==', 'admin'));
      const adminIds = admins.map((a) => a.id);
      
      await notifyPaymentSubmitted(customerId, paymentId, input.amount, adminIds);
    } catch (err) {
      console.error('Failed to send payment submitted notification', err);
    }

    return paymentId;
  }

  /**
   * Approve a pending payment:
   *  1. Mark payment verified in a Firestore transaction
   *  2. Activate the subscription
   *  3. Create an invoice record
   *  4. Generate a PDF bill (browser-side, jsPDF)
   *  5. Email the invoice to the customer (EmailJS)
   */
  async approvePayment(
    paymentId: string,
    adminUid: string,
    notes?: string,
    /** Extra data needed for the PDF / email — pass from the admin UI */
    meta?: {
      customerEmail: string;
      customerName: string;
      planName: string;
      planTier: string;
      deliveryAddress: string;
      pricePerDay: number;
      quantity?: number;
    },
  ): Promise<ManualPayment> {
    let capturedPayment!: ManualPayment;

    await runTransaction(db, async (t) => {
      const paymentRef = doc(db, 'payments', paymentId);
      const paymentSnap = await t.get(paymentRef);
      if (!paymentSnap.exists()) throw new Error('Payment not found');

      const payment = paymentSnap.data() as ManualPayment;
      if (payment.status !== 'pending') throw new Error('Payment already processed');

      const subRef = doc(db, 'subscriptions', payment.subscriptionId);

      t.update(paymentRef, {
        status: 'verified',
        verificationDate: serverTimestamp(),
        verifiedBy: adminUid,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        verificationNotes: notes ?? null,
      });

      t.update(subRef, {
        status: 'active',
        latestPaymentId: paymentId,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });

      const invoiceId = crypto.randomUUID();
      const invoiceRef = doc(db, 'invoices', invoiceId);
      t.set(invoiceRef, {
        id: invoiceId,
        subscriptionId: payment.subscriptionId,
        customerId: payment.customerId,
        amount: payment.amount,
        billingMonth: payment.billingMonth ?? new Date().toISOString().slice(0, 7),
        status: 'paid',
        issuedAt: serverTimestamp(),
        paidAt: serverTimestamp(),
        paymentId: payment.id,
      });

      capturedPayment = payment;
    });

    // ── Auto-generate initial orders if subscription starts today or earlier ──
    try {
      const { subscriptionRepository } = await import('../firestore/subscriptionRepository');
      const { orderService } = await import('./orderService');
      const subscription = await subscriptionRepository.getById(capturedPayment.subscriptionId);
      
      if (subscription) {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        if (subscription.startDate <= today) {
          const mealTypes = subscription.mealPreferences.map(p => p.mealType);
          console.log(`[PaymentService] Subscription ${subscription.id} activated via payment. Generating orders for today (${today})...`);
          await orderService.generateOrdersForSubscription(subscription, today, mealTypes);
        }
      }
    } catch (err) {
      console.error(`[PaymentService] Failed to generate initial orders for subscription ${capturedPayment.subscriptionId}:`, err);
    }

    // ── PDF + Email (fire-and-forget, non-blocking) ──────────────────────────
    if (meta) {
      try {
        const invoiceNumber = `INV-${Date.now()}`;
        const today = new Date().toISOString().split('T')[0];
        const billingMonth = capturedPayment.billingMonth ?? today.slice(0, 7);

        const invoiceData: InvoiceData = {
          invoiceNumber,
          billingMonth,
          customerName: meta.customerName || capturedPayment.customerName,
          customerEmail: meta.customerEmail,
          deliveryAddress: meta.deliveryAddress,
          planName: meta.planName,
          planTier: meta.planTier,
          pricePerDay: meta.pricePerDay,
          quantity: meta.quantity || 1,
          totalAmount: capturedPayment.amount,
          paymentMethod: capturedPayment.paymentMethod,
          referenceNumber: capturedPayment.referenceNumber,
          paymentDate: capturedPayment.paymentDate,
          approvedDate: today,
        };

        const pdf = generateInvoicePdf(invoiceData);

        // Auto-download the PDF in the admin's browser
        pdf.save(`Invoice-${invoiceNumber}.pdf`);

        // Send email to customer (gracefully skips if EmailJS not configured)
        sendInvoiceEmail({
          toEmail: meta.customerEmail,
          toName: meta.customerName || capturedPayment.customerName,
          planName: meta.planName,
          billingMonth: formatBillingMonthLong(billingMonth),
          totalAmount: capturedPayment.amount,
          invoiceNumber,
          paymentMethod: capturedPayment.paymentMethod.replace('_', ' '),
          pdfBase64: pdf.output('datauristring').split(',')[1],
        }).catch((e) => console.warn('[paymentService] email send failed:', e));
      } catch (e) {
        console.warn('[paymentService] PDF/email generation failed (non-critical):', e);
      }
    }

    return capturedPayment;
  }

  /**
   * Reject a pending payment.
   */
  async rejectPayment(
    paymentId: string,
    adminUid: string,
    notes?: string,
  ): Promise<ManualPayment> {
    let capturedPayment!: ManualPayment;

    await runTransaction(db, async (t) => {
      const paymentRef = doc(db, 'payments', paymentId);
      const paymentSnap = await t.get(paymentRef);
      if (!paymentSnap.exists()) throw new Error('Payment not found');

      const payment = paymentSnap.data() as ManualPayment;
      capturedPayment = payment;

      t.update(paymentRef, {
        status: 'rejected',
        verificationDate: serverTimestamp(),
        verifiedBy: adminUid,
        verificationNotes: notes ?? null,
        screenshotUrl: null, // Remove the reference since we are deleting the file
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });
    });

    // Delete screenshot from storage if it exists
    if (capturedPayment.screenshotUrl) {
      try {
        const storage = getStorage();
        // Since we store the full download URL, we can pass it directly to ref()
        const screenshotRef = ref(storage, capturedPayment.screenshotUrl);
        await deleteObject(screenshotRef);
      } catch (err) {
        console.error('[PaymentService] Failed to delete rejected screenshot:', err);
      }
    }

    return capturedPayment;
  }
}

function formatBillingMonthLong(month: string): string {
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

export const paymentService = new PaymentService();
