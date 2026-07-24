import { db } from '@/shared/lib/firebase';
import type { Invoice, ManualPayment, Order } from '@/shared/types';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export class AccountsRepository {
  /**
   * Get all captured payments within a date range.
   */
  async getPaymentsInRange(startDate: Date, endDate: Date): Promise<ManualPayment[]> {
    const q = query(
      collection(db, 'payments'),
      where('status', '==', 'verified'),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as ManualPayment);
  }

  /**
   * Get all invoices within a date range.
   */
  async getInvoicesInRange(startDate: Date, endDate: Date): Promise<Invoice[]> {
    const q = query(
      collection(db, 'invoices'),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as Invoice);
  }

  /**
   * Get all orders within a specific business date range (by date string).
   */
  async getOrdersInDateRange(startDateStr: string, endDateStr: string): Promise<Order[]> {
    const q = query(
      collection(db, 'orders'),
      where('date', '>=', startDateStr),
      where('date', '<=', endDateStr),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as Order);
  }

  /**
   * Request a backend-generated daily report.
   */
  async generateDailyReport(date: string): Promise<{ downloadUrl: string }> {
    // Phase 1: Client-side daily report (mocked as CSV data URL)
    const csvContent = "data:text/csv;charset=utf-8,Date,Report\n" + date + ",Daily Report";
    return { downloadUrl: encodeURI(csvContent) };
  }

  /**
   * Request a backend-generated monthly report.
   */
  async generateMonthlyReport(monthStr: string): Promise<{ downloadUrl: string }> {
    // Phase 1: Client-side monthly report (mocked as CSV data URL)
    const csvContent = "data:text/csv;charset=utf-8,Month,Report\n" + monthStr + ",Monthly Report";
    return { downloadUrl: encodeURI(csvContent) };
  }

  /**
   * Generate a manual invoice (e.g. for one-time catering or adjustments).
   */
  async generateInvoice(payload: { customerId: string; amount: number; description: string }): Promise<void> {
    // Phase 1: Client-side invoice generation
    const invoiceId = crypto.randomUUID();
    await setDoc(doc(db, 'invoices', invoiceId), {
      id: invoiceId,
      customerId: payload.customerId,
      amount: payload.amount,
      status: 'pending',
      description: payload.description,
      issuedAt: serverTimestamp(),
      paidAt: null,
      paymentId: null,
    });
  }
}

export const accountsRepository = new AccountsRepository();
