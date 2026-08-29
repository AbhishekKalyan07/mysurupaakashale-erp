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
   * Returns raw CSV string instead of a data URI to handle large reports.
   */
  async generateDailyReport(date: string): Promise<string> {
    const orders = await this.getOrdersInDateRange(date, date);
    let csvContent = "ID,Customer ID,Date,Tier,Meal Type,Status\n";
    orders.forEach(order => {
      // Escape values properly for CSV
      const escapeCsv = (val: any) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const row = [
        escapeCsv(order.id), 
        escapeCsv(order.customerId), 
        escapeCsv(order.date), 
        escapeCsv(order.planTier), 
        escapeCsv(order.mealType), 
        escapeCsv(order.status)
      ].join(',');
      csvContent += row + "\n";
    });
    return csvContent;
  }

  /**
   * Request a backend-generated monthly report.
   * Returns raw CSV string instead of a data URI.
   * Ensures timezone boundaries strictly follow IST (Asia/Kolkata).
   */
  async generateMonthlyReport(monthStr: string): Promise<string> {
    const year = parseInt(monthStr.split('-')[0]);
    const month = parseInt(monthStr.split('-')[1]);
    const paddedMonth = month.toString().padStart(2, '0');
    
    // Calculate last day of the month
    const lastDay = new Date(year, month, 0).getDate();
    const paddedLastDay = lastDay.toString().padStart(2, '0');

    // Create boundaries explicitly in Asia/Kolkata timezone (UTC+05:30)
    const startDate = new Date(`${year}-${paddedMonth}-01T00:00:00+05:30`);
    const endDate = new Date(`${year}-${paddedMonth}-${paddedLastDay}T23:59:59.999+05:30`);
    
    const invoices = await this.getInvoicesInRange(startDate, endDate);
    let csvContent = "ID,Customer ID,Amount,Status,Issued At\n";
    invoices.forEach(inv => {
      const dateStr = inv.createdAt && (inv.createdAt as any).seconds 
        ? new Date((inv.createdAt as any).seconds * 1000).toISOString() 
        : '';
        
      const escapeCsv = (val: any) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const row = [
        escapeCsv(inv.id), 
        escapeCsv(inv.customerId), 
        escapeCsv(inv.totalAmount), 
        escapeCsv(inv.status), 
        escapeCsv(dateStr)
      ].join(',');
      csvContent += row + "\n";
    });
    return csvContent;
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
