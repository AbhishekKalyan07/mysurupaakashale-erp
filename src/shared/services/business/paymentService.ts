import { runTransaction, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { ManualPayment, SubmitPaymentInput } from '@/shared/types';
import { paymentRepository } from '../firestore/paymentRepository';

class PaymentService {
  /**
   * Submit a new payment for a subscription.
   */
  async submitPayment(input: SubmitPaymentInput, customerId: string, customerName: string): Promise<string> {
    return paymentRepository.create({
      subscriptionId: input.subscriptionId,
      customerId,
      customerName,
      amount: input.amount,
      currency: 'INR',
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      paymentDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      verificationDate: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    });
  }

  /**
   * Approve a pending payment, activating the subscription and generating an invoice.
   */
  async approvePayment(paymentId: string, adminUid: string, notes?: string): Promise<ManualPayment> {
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
        updatedAt: serverTimestamp(),
        verificationNotes: notes ?? null,
      });
      
      t.update(subRef, {
        status: 'active',
        latestPaymentId: paymentId,
        updatedAt: serverTimestamp(),
      });
      
      const invoiceRef = doc(db, 'invoices', crypto.randomUUID());
      t.set(invoiceRef, {
        id: invoiceRef.id,
        subscriptionId: payment.subscriptionId,
        customerId: payment.customerId,
        amount: payment.amount,
        status: 'paid',
        issuedAt: serverTimestamp(),
        paidAt: serverTimestamp(),
        paymentId: payment.id,
      });

      capturedPayment = payment;
    });

    return capturedPayment;
  }

  /**
   * Reject a pending payment.
   */
  async rejectPayment(paymentId: string, adminUid: string, notes?: string): Promise<ManualPayment> {
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
        updatedAt: serverTimestamp(),
      });
    });

    return capturedPayment;
  }
}

export const paymentService = new PaymentService();
