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
    const orders = await this.getOrdersInDateRange(date, date);
    let csvContent = "data:text/csv;charset=utf-8,ID,Customer ID,Date,Tier,Meal Type,Status\n";
    orders.forEach(order => {
      const row = [order.id, order.customerId, order.date, order.planTier, order.mealType, order.status].join(',');
      csvContent += row + "\n";
    });
    return { downloadUrl: encodeURI(csvContent) };
  }

  /**
   * Request a backend-generated monthly report.
   */
  async generateMonthlyReport(monthStr: string): Promise<{ downloadUrl: string }> {
    const year = parseInt(monthStr.split('-')[0]);
    const month = parseInt(monthStr.split('-')[1]);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const invoices = await this.getInvoicesInRange(startDate, endDate);
    let csvContent = "data:text/csv;charset=utf-8,ID,Customer ID,Amount,Status,Issued At\n";
    invoices.forEach(inv => {
      const dateStr = inv.createdAt && (inv.createdAt as any).seconds 
        ? new Date((inv.createdAt as any).seconds * 1000).toISOString() 
        : '';
      const row = [inv.id, inv.customerId, inv.totalAmount, inv.status, dateStr].join(',');
      csvContent += row + "\n";
    });
    return { downloadUrl: encodeURI(csvContent) };
  }

  /**
   * Generate a manual invoice (e.g. for one-time catering or adjustments).
   */
  async generateInvoice(payload: { customerId: string; amount: number; description: string }): Promise<void> {
    const invoiceId = crypto.randomUUID();
    await setDoc(doc(db, 'invoices', invoiceId), {
      id: invoiceId,
      invoiceNumber: `INV-${Date.now()}`,
      customerId: payload.customerId,
      subscriptionId: null,
      lineItems: [{ description: payload.description, quantity: 1, unitPrice: payload.amount, amount: payload.amount }],
      subtotal: payload.amount,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: payload.amount,
      currency: 'INR',
      status: 'issued',
      billingPeriodStart: new Date().toISOString().split('T')[0],
      billingPeriodEnd: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paidAt: null,
      paymentId: null,
      createdAt: serverTimestamp(),
    });
  }
}

export const accountsRepository = new AccountsRepository();
