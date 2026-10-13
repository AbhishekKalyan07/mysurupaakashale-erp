import { db } from "@/shared/lib/firebase";
import type { Invoice, ManualPayment, Order } from "@/shared/types";
import {
  getInvoicePaidAmount,
  isInvoiceCollectedAmountKnown,
  getInvoiceRemainingDue,
  getInvoiceRemainingToRefund,
} from "@/shared/types";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export class AccountsRepository {
  /**
   * Get all captured payments within a date range.
   */
  async getPaymentsInRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ManualPayment[]> {
    const q = query(
      collection(db, "payments"),
      where("status", "==", "verified"),
      where("createdAt", ">=", Timestamp.fromDate(startDate)),
      where("createdAt", "<=", Timestamp.fromDate(endDate)),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as ManualPayment);
  }

  /**
   * Get all invoices within a date range.
   */
  async getInvoicesInRange(startDate: Date, endDate: Date): Promise<Invoice[]> {
    const q = query(
      collection(db, "invoices"),
      where("createdAt", ">=", Timestamp.fromDate(startDate)),
      where("createdAt", "<=", Timestamp.fromDate(endDate)),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as Invoice);
  }

  /**
   * Get all orders within a specific business date range (by date string).
   */
  async getOrdersInDateRange(
    startDateStr: string,
    endDateStr: string,
  ): Promise<Order[]> {
    const q = query(
      collection(db, "orders"),
      where("date", ">=", startDateStr),
      where("date", "<=", endDateStr),
      orderBy("date", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as Order);
  }

  /**
   * Request a backend-generated daily report.
   * Returns raw CSV string instead of a data URI to handle large reports.
   */
  async generateDailyReport(date: string): Promise<string> {
    const orders = await this.getOrdersInDateRange(date, date);
    let csvContent = "ID,Customer ID,Date,Tier,Meal Type,Status\n";
    orders.forEach((order) => {
      // Escape values properly for CSV
      const escapeCsv = (val: any) => {
        if (val == null) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
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
        escapeCsv(order.status),
      ].join(",");
      csvContent += row + "\n";
    });
    return csvContent;
  }

  /**
   * Get all invoices for a specific month (e.g. "2026-07").
   * Captures both invoices whose billing cycle ended in that month (including month-end bills
   * generated on the 1st of the following month) and any ad-hoc invoices created in that month.
   */
  async getInvoicesForMonth(monthStr: string): Promise<Invoice[]> {
    const year = parseInt(monthStr.split("-")[0]);
    const month = parseInt(monthStr.split("-")[1]);
    const paddedMonth = month.toString().padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    const paddedLastDay = lastDay.toString().padStart(2, "0");

    const startDateStr = `${year}-${paddedMonth}-01`;
    const endDateStr = `${year}-${paddedMonth}-${paddedLastDay}`;

    const invoicesMap = new Map<string, Invoice>();

    try {
      // 1. Query by billingPeriodEnd (all subscription cycle bills ending in this month)
      const qBilling = query(
        collection(db, "invoices"),
        where("billingPeriodEnd", ">=", startDateStr),
        where("billingPeriodEnd", "<=", endDateStr),
      );
      const snapBilling = await getDocs(qBilling);
      snapBilling.docs.forEach((d) => {
        invoicesMap.set(d.id, d.data() as Invoice);
      });
    } catch (err) {
      console.warn("[accountsRepository] getInvoicesForMonth billing query error:", err);
    }

    try {
      // 2. Query by createdAt (covers ad-hoc manual invoices created in this month)
      const startDate = new Date(`${startDateStr}T00:00:00+05:30`);
      const endDate = new Date(`${endDateStr}T23:59:59.999+05:30`);
      const qCreated = query(
        collection(db, "invoices"),
        where("createdAt", ">=", Timestamp.fromDate(startDate)),
        where("createdAt", "<=", Timestamp.fromDate(endDate)),
      );
      const snapCreated = await getDocs(qCreated);
      snapCreated.docs.forEach((d) => {
        const inv = d.data() as Invoice;
        // Include if no billingPeriodEnd or if it also belongs to this month
        if (!inv.billingPeriodEnd || inv.billingPeriodEnd.startsWith(monthStr)) {
          invoicesMap.set(d.id, inv);
        }
      });
    } catch (err) {
      console.warn("[accountsRepository] getInvoicesForMonth created query error:", err);
    }

    return Array.from(invoicesMap.values()).sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds ?? 0;
      const timeB = (b.createdAt as any)?.seconds ?? 0;
      return timeB - timeA;
    });
  }

  /**
   * Get all invoices for a specific customer, newest first.
   */
  async getInvoicesByCustomerId(customerId: string): Promise<Invoice[]> {
    const q = query(
      collection(db, "invoices"),
      where("customerId", "==", customerId),
    );
    const snap = await getDocs(q);
    const invoices = snap.docs.map((doc) => doc.data() as Invoice);
    return invoices.sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds ?? 0;
      const timeB = (b.createdAt as any)?.seconds ?? 0;
      return timeB - timeA;
    });
  }

  /**
   * Request a backend-generated monthly report.
   * Returns raw CSV string instead of a data URI.
   * Ensures timezone boundaries strictly follow IST (Asia/Kolkata).
   */
  async generateMonthlyReport(monthStr: string): Promise<string> {
    const year = parseInt(monthStr.split("-")[0]);
    const month = parseInt(monthStr.split("-")[1]);
    const paddedMonth = month.toString().padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    const paddedLastDay = lastDay.toString().padStart(2, "0");

    const startDate = new Date(`${year}-${paddedMonth}-01T00:00:00+05:30`);
    const endDate = new Date(
      `${year}-${paddedMonth}-${paddedLastDay}T23:59:59.999+05:30`,
    );

    const invoices = await this.getInvoicesInRange(startDate, endDate);
    let csvContent =
      "Invoice Number,Customer ID,Billing Period Start,Billing Period End,Subtotal,Deposit Held,Total Due,Paid Amount,Collected Amount,Remaining Due,Remaining to Refund,Status,Date\n";
    invoices.forEach((inv) => {
      const dateStr =
        inv.createdAt && (inv.createdAt as any).seconds
          ? new Date((inv.createdAt as any).seconds * 1000).toISOString().split("T")[0]
          : "";

      const escapeCsv = (val: any) => {
        if (val == null) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const collectedStr = isInvoiceCollectedAmountKnown(inv)
        ? inv.collectedAmount
        : "Unknown (Legacy)";

      const row = [
        escapeCsv(inv.invoiceNumber || inv.id),
        escapeCsv(inv.customerId),
        escapeCsv(inv.billingPeriodStart || ""),
        escapeCsv(inv.billingPeriodEnd || ""),
        escapeCsv(inv.subtotal ?? inv.totalAmount),
        escapeCsv(inv.depositHeld ?? 0),
        escapeCsv(inv.totalAmount),
        escapeCsv(getInvoicePaidAmount(inv)),
        escapeCsv(collectedStr),
        escapeCsv(getInvoiceRemainingDue(inv)),
        escapeCsv(getInvoiceRemainingToRefund(inv)),
        escapeCsv(inv.status),
        escapeCsv(dateStr),
      ].join(",");
      csvContent += row + "\n";
    });
    return csvContent;
  }

  /**
   * Get all invoices, optionally filtered by status or customerId, ordered newest first.
   */
  async getAllInvoices(filter?: {
    status?: string;
    customerId?: string;
  }): Promise<Invoice[]> {
    let invoices: Invoice[] = [];

    if (filter?.customerId) {
      invoices = await this.getInvoicesByCustomerId(filter.customerId);
    } else {
      const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      invoices = snap.docs.map((doc) => doc.data() as Invoice);
    }

    if (filter?.status && filter.status !== "all") {
      invoices = invoices.filter((inv) => inv.status === filter.status);
    }

    return invoices;
  }

  /**
   * Get an invoice by its unique document ID.
   */
  async getInvoiceById(invoiceId: string): Promise<Invoice | null> {
    if (!invoiceId) return null;
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "invoices", invoiceId));
    if (!snap.exists()) return null;
    return snap.data() as Invoice;
  }

  /**
   * Void an invoice with mandatory audit reason. Does not delete historical document.
   */
  async voidInvoice(
    invoiceId: string,
    reason: string,
    adminUid: string,
    adminName = "Admin",
  ): Promise<void> {
    if (!invoiceId) throw new Error("Invoice ID is required");
    if (!reason || !reason.trim()) throw new Error("Void reason is mandatory");

    const { runTransaction } = await import("firebase/firestore");
    const invoiceRef = doc(db, "invoices", invoiceId);

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(invoiceRef);
      if (!snap.exists()) throw new Error("Invoice not found");
      const inv = snap.data() as Invoice;
      if (inv.status === "void") throw new Error("Invoice is already voided");
      if (inv.status === "paid") {
        throw new Error(
          "Paid invoices cannot be voided directly. Refund or adjust payments first.",
        );
      }

      txn.update(invoiceRef, {
        status: "void",
        voidedAt: serverTimestamp(),
        voidedBy: adminUid,
        voidReason: reason.trim(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      const { auditRepository } = await import("./auditRepository");
      await auditRepository.logAction(
        "invoice_voided",
        adminUid,
        "admin",
        adminName,
        invoiceId,
        "invoice",
        { invoiceId, reason: reason.trim() },
      );
    } catch (err) {
      console.warn("[accountsRepository] audit log failed for voidInvoice:", err);
    }
  }

  /**
   * Record an offline payment (cash, UPI, bank transfer) directly against an issued invoice.
   */
  async recordOfflinePayment(params: {
    invoiceId: string;
    amount: number;
    paymentMethod: import("@/shared/types").PaymentMethod;
    referenceNumber?: string;
    paymentDate?: string;
    notes?: string;
    adminUid: string;
    adminName?: string;
  }): Promise<string> {
    const {
      invoiceId,
      amount,
      paymentMethod,
      referenceNumber = null,
      paymentDate = new Date().toISOString().split("T")[0],
      notes = null,
      adminUid,
      adminName = "Admin",
    } = params;

    if (!invoiceId) throw new Error("Invoice ID is required");
    if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      throw new Error("Payment amount must be a positive number");
    }

    const { runTransaction } = await import("firebase/firestore");
    const invoiceRef = doc(db, "invoices", invoiceId);
    const paymentId = crypto.randomUUID();
    const paymentRef = doc(db, "payments", paymentId);

    let customerId = "";
    let finalPaidAmount = 0;
    let finalCollectedAmount = 0;
    let finalRemainingToRefund = 0;

    await runTransaction(db, async (txn) => {
      const invSnap = await txn.get(invoiceRef);
      if (!invSnap.exists()) throw new Error("Invoice not found");
      const invoice = invSnap.data() as Invoice;

      if (invoice.status === "paid") {
        throw new Error("Invoice is already fully paid");
      }
      if (invoice.status === "void") {
        throw new Error("Cannot record payment for a voided invoice");
      }

      customerId = invoice.customerId;
      const totalAmount = invoice.totalAmount;
      const currentCollected = typeof (invoice as any).collectedAmount === "number"
        ? (invoice as any).collectedAmount
        : (typeof invoice.paidAmount === "number" ? invoice.paidAmount : 0);
      const newCollectedAmount = currentCollected + amount;
      finalCollectedAmount = newCollectedAmount;

      const newPaidAmount = Math.min(totalAmount, newCollectedAmount);
      finalPaidAmount = newPaidAmount;

      // 1. Fetch customer details for denormalized payment record
      const userRef = doc(db, "users", customerId);
      const userSnap = await txn.get(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;
      const customerName = userData?.fullName || "Customer";
      const customerDisplayId = userData?.displayId || null;

      // 2. Create verified payment record
      txn.set(paymentRef, {
        id: paymentId,
        subscriptionId: invoice.subscriptionId || "manual",
        invoiceId: invoice.id,
        customerId,
        customerName,
        customerDisplayId,
        amount,
        currency: "INR",
        purpose: "usage",
        paymentMethod,
        referenceNumber,
        paymentDate,
        status: "verified",
        verifiedBy: adminUid,
        verificationDate: serverTimestamp(),
        verificationNotes: notes || `Recorded offline via admin (${adminName})`,
        screenshotUrl: null,
        billingMonth: paymentDate.substring(0, 7),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Handle payment calculation and reconciliation (Phase 6E - Option A)
      const isPaidInFull = newPaidAmount >= totalAmount;
      const confirmedRefunds = Math.max(0, (invoice as any).confirmedRefunds || 0);
      const remainingToRefund = Math.max(0, newCollectedAmount - totalAmount - confirmedRefunds);
      finalRemainingToRefund = remainingToRefund;

      txn.update(invoiceRef, {
        paidAmount: newPaidAmount, // Option A: strictly capped at totalAmount
        collectedAmount: newCollectedAmount, // Total cash received
        status: isPaidInFull ? "paid" : "issued",
        remainingToRefund,
        paidAt: isPaidInFull && !invoice.paidAt ? serverTimestamp() : invoice.paidAt || null,
        paymentId,
        updatedAt: serverTimestamp(),
      });
    });

    try {
      const { auditRepository } = await import("./auditRepository");
      await auditRepository.logAction(
        "offline_payment_recorded",
        adminUid,
        "admin",
        adminName,
        paymentId,
        "payment",
        {
          paymentId,
          invoiceId,
          customerId,
          amount,
          paymentMethod,
          paidAmount: finalPaidAmount,
          collectedAmount: finalCollectedAmount,
          remainingToRefund: finalRemainingToRefund,
        },
      );
    } catch (auditErr) {
      console.warn("[accountsRepository] audit log failed for offline payment:", auditErr);
    }

    return paymentId;
  }

  /**
   * Generate a manual invoice (e.g. for one-time catering or adjustments).
   */
  async generateInvoice(payload: {
    customerId: string;
    amount: number;
    description: string;
  }): Promise<void> {
    const invoiceId = crypto.randomUUID();
    await setDoc(doc(db, "invoices", invoiceId), {
      id: invoiceId,
      invoiceNumber: `INV-${Date.now()}`,
      customerId: payload.customerId,
      subscriptionId: null,
      lineItems: [
        {
          description: payload.description,
          quantity: 1,
          unitPrice: payload.amount,
          amount: payload.amount,
        },
      ],
      subtotal: payload.amount,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: payload.amount,
      paidAmount: 0,
      collectedAmount: 0,
      remainingToRefund: 0,
      creditApplied: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: new Date().toISOString().split("T")[0],
      billingPeriodEnd: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      paidAt: null,
      paymentId: null,
      createdAt: serverTimestamp(),
    });
  }
}

export const accountsRepository = new AccountsRepository();
