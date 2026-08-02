/**
 * Payment ↔ Subscription sync audit script.
 * Run with:  npx vite-node scripts/audit-payments.ts
 */
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../src/shared/lib/firebase';

interface PaymentDoc {
  id: string;
  subscriptionId: string;
  customerId: string;
  customerName: string;
  amount: number;
  status: string;
  paymentDate: string;
  billingMonth: string;
  paymentMethod: string;
  referenceNumber: string;
  verifiedBy: string | null;
  verificationDate: any;
  createdAt: any;
}

interface SubscriptionDoc {
  id: string;
  customerId: string;
  status: string;
  planTier: string;
  latestPaymentId: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: any;
}

interface InvoiceDoc {
  id: string;
  subscriptionId: string;
  customerId: string;
  paymentId: string | null;
  amount: number;
  status: string;
}

async function audit() {
  console.log('=== PAYMENT SYNC AUDIT ===\n');

  // 1. Fetch all payments
  const paymentsSnap = await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc')));
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentDoc));
  console.log(`📦 Total payments: ${payments.length}`);

  // 2. Fetch all subscriptions
  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubscriptionDoc));
  console.log(`📋 Total subscriptions: ${subs.length}`);

  // 3. Fetch all invoices
  const invoicesSnap = await getDocs(collection(db, 'invoices'));
  const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as InvoiceDoc));
  console.log(`🧾 Total invoices: ${invoices.length}\n`);

  // --- Payment status breakdown ---
  const pending = payments.filter(p => p.status === 'pending');
  const verified = payments.filter(p => p.status === 'verified');
  const rejected = payments.filter(p => p.status === 'rejected');
  console.log('── Payment Status Breakdown ──');
  console.log(`  ⏳ Pending:  ${pending.length}`);
  console.log(`  ✅ Verified: ${verified.length}`);
  console.log(`  ❌ Rejected: ${rejected.length}\n`);

  // --- Check 1: Pending payments older than 2 days ---
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  console.log('── ⚠️  STALE PENDING PAYMENTS (>2 days old) ──');
  let staleCount = 0;
  for (const p of pending) {
    const createdAt = p.createdAt?.toDate?.() || new Date(p.createdAt);
    if (createdAt < twoDaysAgo) {
      staleCount++;
      const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
      console.log(`  🔴 Payment ${p.id}`);
      console.log(`     Customer: ${p.customerName} (${p.customerId.slice(0, 8)}...)`);
      console.log(`     Amount: ₹${p.amount} | Method: ${p.paymentMethod} | Ref: ${p.referenceNumber}`);
      console.log(`     Payment Date: ${p.paymentDate} | Created: ${daysAgo} days ago`);
      console.log(`     Subscription: ${p.subscriptionId}`);
      console.log('');
    }
  }
  if (staleCount === 0) console.log('  ✅ None — all pending payments are recent.\n');

  // --- Check 2: Verified payments without matching invoice ---
  console.log('── ⚠️  VERIFIED PAYMENTS WITHOUT INVOICE ──');
  let missingInvoice = 0;
  for (const p of verified) {
    const matchingInvoice = invoices.find(i => i.paymentId === p.id);
    if (!matchingInvoice) {
      missingInvoice++;
      console.log(`  🔴 Payment ${p.id} (₹${p.amount}) — verified but NO invoice found`);
      console.log(`     Customer: ${p.customerName} | Subscription: ${p.subscriptionId}`);
      console.log('');
    }
  }
  if (missingInvoice === 0) console.log('  ✅ All verified payments have matching invoices.\n');

  // --- Check 3: Subscriptions with pending_payment status but no pending payment ---
  console.log('── ⚠️  SUBSCRIPTION ↔ PAYMENT MISMATCH ──');
  let mismatchCount = 0;
  for (const sub of subs) {
    const subPayments = payments.filter(p => p.subscriptionId === sub.id);
    
    // Sub is pending_payment but no pending payment exists
    if (sub.status === 'pending_payment') {
      const hasPendingPayment = subPayments.some(p => p.status === 'pending');
      if (!hasPendingPayment) {
        mismatchCount++;
        console.log(`  🔴 Subscription ${sub.id} is "pending_payment" but has NO pending payment`);
        console.log(`     Customer: ${sub.customerId.slice(0, 8)}... | Plan: ${sub.planTier}`);
        console.log(`     Payments: ${subPayments.length} total (${subPayments.map(p => p.status).join(', ') || 'none'})`);
        console.log('');
      }
    }

    // Sub is active but has no verified payment and no latestPaymentId
    if (sub.status === 'active' && !sub.latestPaymentId) {
      const hasVerified = subPayments.some(p => p.status === 'verified');
      if (!hasVerified) {
        mismatchCount++;
        console.log(`  ⚠️  Subscription ${sub.id} is "active" but has NO verified payment`);
        console.log(`     Customer: ${sub.customerId.slice(0, 8)}... | Plan: ${sub.planTier}`);
        console.log(`     (May have been activated via admin fast-path)`);
        console.log('');
      }
    }

    // Verified payment exists but subscription is still pending_payment
    if (sub.status === 'pending_payment') {
      const hasVerified = subPayments.some(p => p.status === 'verified');
      if (hasVerified) {
        mismatchCount++;
        console.log(`  🔴 Subscription ${sub.id} is STILL "pending_payment" but has a VERIFIED payment!`);
        console.log(`     Customer: ${sub.customerId.slice(0, 8)}... | Plan: ${sub.planTier}`);
        console.log(`     ⚡ This subscription should be ACTIVE — sync is broken.`);
        console.log('');
      }
    }
  }
  if (mismatchCount === 0) console.log('  ✅ All subscriptions and payments are in sync.\n');

  // --- Summary ---
  console.log('══════════════════════════════');
  const issues = staleCount + missingInvoice + mismatchCount;
  if (issues === 0) {
    console.log('✅ ALL GOOD — payments are fully synced.');
  } else {
    console.log(`⚠️  ${issues} issue(s) found. Review above.`);
  }
  console.log('══════════════════════════════');

  process.exit(0);
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
