process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-test';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT_ID = 'demo-test';

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const auth = getAuth();

async function seedPhase5Fixtures() {
  console.log('[Phase5-Seed] Fetching customer user...');
  const customerUser = await auth.getUserByEmail('customer@test.com');
  const custUid = customerUser.uid;
  console.log('[Phase5-Seed] Customer UID:', custUid);

  // 1. Modern Phase 5 invoice with partial payment & credit applied
  // subtotal 3000, creditApplied 500 => totalAmount 2500, paidAmount 1000 => remainingDue 1500
  await db.collection('invoices').doc('inv-modern-e2e-01').set({
    id: 'inv-modern-e2e-01',
    invoiceNumber: 'INV-MODERN-2026-001',
    customerId: custUid,
    subscriptionId: 'sub-test-01',
    subtotal: 3000,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 2500,
    paidAmount: 1000,
    creditApplied: 500,
    currency: 'INR',
    status: 'issued',
    billingPeriodStart: '2026-09-01',
    billingPeriodEnd: '2026-09-30',
    dueDate: '2026-10-15',
    lineItems: [
      { description: 'Meal Plan - September (30 days)', amount: 3000, quantity: 1 }
    ],
    createdAt: new Date('2026-09-30T10:00:00Z'),
    updatedAt: new Date('2026-09-30T10:00:00Z'),
  });

  // 2. Legacy issued invoice (omitted paidAmount and creditApplied)
  // totalAmount 2500 => remainingDue 2500
  await db.collection('invoices').doc('inv-legacy-e2e-02').set({
    id: 'inv-legacy-e2e-02',
    invoiceNumber: 'INV-LEGACY-2026-002',
    customerId: custUid,
    subscriptionId: 'sub-test-01',
    subtotal: 2500,
    totalAmount: 2500,
    currency: 'INR',
    status: 'issued',
    billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31',
    dueDate: '2026-09-15',
    lineItems: [
      { description: 'Meal Plan - August (Legacy)', amount: 2500, quantity: 1 }
    ],
    createdAt: new Date('2026-08-31T10:00:00Z'),
    updatedAt: new Date('2026-08-31T10:00:00Z'),
  });

  // 3. Legacy paid invoice (omitted paidAmount and creditApplied, status 'paid')
  // remainingDue => 0
  await db.collection('invoices').doc('inv-legacy-paid-03').set({
    id: 'inv-legacy-paid-03',
    invoiceNumber: 'INV-LEGACY-PAID-003',
    customerId: custUid,
    subscriptionId: 'sub-test-01',
    subtotal: 2000,
    totalAmount: 2000,
    currency: 'INR',
    status: 'paid',
    billingPeriodStart: '2026-07-01',
    billingPeriodEnd: '2026-07-31',
    dueDate: '2026-08-15',
    paidAt: '2026-08-02',
    lineItems: [
      { description: 'Meal Plan - July (Legacy Paid)', amount: 2000, quantity: 1 }
    ],
    createdAt: new Date('2026-07-31T10:00:00Z'),
    updatedAt: new Date('2026-07-31T10:00:00Z'),
  });

  // 4. Update customer document credit balance and seed initial ledger entry
  await db.collection('users').doc(custUid).update({
    creditBalance: 200,
  });

  await db.collection('users').doc(custUid).collection('ledger').doc('led-initial-01').set({
    id: 'led-initial-01',
    customerId: custUid,
    amount: 200,
    balanceAfter: 200,
    type: 'manual_adjustment',
    reason: 'Initial credit balance setup',
    actorId: 'admin-seed',
    actorRole: 'admin',
    actorName: 'Admin Seed',
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });

  console.log('[Phase5-Seed] Phase 5 test fixtures seeded successfully.');
}

if (require.main === module) {
  seedPhase5Fixtures().catch(err => {
    console.error('[Phase5-Seed] Error:', err);
    process.exit(1);
  });
}

module.exports = { seedPhase5Fixtures };
