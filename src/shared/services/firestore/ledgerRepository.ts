import { db } from "@/shared/lib/firebase";
import type { CustomerLedgerEntry } from "@/shared/types";
import {
  collection,
  doc,
  query,
  orderBy,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { auditRepository } from "./auditRepository";

export class LedgerRepository {
  /**
   * Fetch all ledger entries for a customer, newest first.
   */
  async getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    if (!customerId) return [];
    const q = query(
      collection(db, `users/${customerId}/ledger`),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CustomerLedgerEntry);
  }

  /**
   * Real-time subscription to a customer's ledger entries.
   */
  subscribeCustomerLedger(
    customerId: string,
    onNext: (entries: CustomerLedgerEntry[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    if (!customerId) {
      onNext([]);
      return () => {};
    }
    const q = query(
      collection(db, `users/${customerId}/ledger`),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        const entries = snap.docs.map((d) => d.data() as CustomerLedgerEntry);
        onNext(entries);
      },
      onError,
    );
  }

  /**
   * Fetch the current credit balance of a customer.
   */
  async getCustomerCreditBalance(customerId: string): Promise<number> {
    if (!customerId) return 0;
    const { getDoc } = await import("firebase/firestore");
    const userSnap = await getDoc(doc(db, "users", customerId));
    if (!userSnap.exists()) return 0;
    const data = userSnap.data();
    return typeof data.creditBalance === "number" && !isNaN(data.creditBalance)
      ? Math.max(0, data.creditBalance)
      : 0;
  }

  /**
   * Transactional, idempotent manual credit/debit adjustment by an authorized admin.
   */
  async adjustCustomerCredit(params: {
    customerId: string;
    amount: number; // positive for credit, negative for debit
    reason: string;
    actorId: string;
    actorRole: "admin" | "accounts";
    actorName?: string;
    type?: "manual_adjustment" | "refund";
    referenceId?: string;
  }): Promise<{ entryId: string; balanceAfter: number }> {
    const {
      customerId,
      amount,
      reason,
      actorId,
      actorRole,
      actorName = "Admin",
      type = "manual_adjustment",
      referenceId = null,
    } = params;

    if (!customerId || !customerId.trim()) {
      throw new Error("Customer ID is required");
    }
    if (typeof amount !== "number" || isNaN(amount) || amount === 0) {
      throw new Error("Adjustment amount must be a non-zero number");
    }
    if (!reason || !reason.trim()) {
      throw new Error("Adjustment reason is mandatory");
    }

    const entryId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let resultingBalance = 0;

    await runTransaction(db, async (txn) => {
      const userRef = doc(db, "users", customerId);
      const userSnap = await txn.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const currentBalance =
        typeof userSnap.data()?.creditBalance === "number"
          ? userSnap.data().creditBalance
          : 0;

      resultingBalance = currentBalance + amount;
      if (resultingBalance < 0) {
        throw new Error(
          `Cannot deduct ₹${Math.abs(amount).toLocaleString()} from credit balance of ₹${currentBalance.toLocaleString()}. Resulting balance cannot be negative.`,
        );
      }

      // Update cached balance on customer document
      txn.update(userRef, {
        creditBalance: resultingBalance,
        updatedAt: serverTimestamp(),
      });

      // Write immutable ledger entry
      const ledgerRef = doc(db, `users/${customerId}/ledger`, entryId);
      txn.set(ledgerRef, {
        id: entryId,
        customerId,
        type,
        amount,
        balanceAfter: resultingBalance,
        reason: reason.trim(),
        referenceId,
        invoiceId: null,
        paymentId: referenceId,
        actorId,
        actorRole,
        createdAt: serverTimestamp(),
      });
    });

    // Audit trail
    try {
      await auditRepository.logAction(
        "credit_adjusted",
        actorId,
        actorRole,
        actorName,
        customerId,
        "user",
        {
          customerId,
          adjustmentAmount: amount,
          balanceAfter: resultingBalance,
          reason: reason.trim(),
          ledgerEntryId: entryId,
          type,
        },
      );
    } catch (auditErr) {
      console.warn("[LedgerRepository] Failed to write audit log:", auditErr);
    }

    return { entryId, balanceAfter: resultingBalance };
  }
}

export const ledgerRepository = new LedgerRepository();
