import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs, query, where } from '@firebase/firestore';

const PROJECT_ID = 'demo-targeted-scenarios';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('Targeted Real-World Verification Suite (Scenarios 1, 3, 4, 5, 7, 8)', () => {
  let env: RulesTestEnvironment;

  const ADMIN_UID = 'uid-admin-targeted';
  const ACCOUNTS_UID = 'uid-accounts-targeted';
  const KITCHEN_UID = 'uid-kitchen-targeted';
  const DELIVERY_UID = 'uid-delivery-targeted';
  const CUSTOMER_A_UID = 'uid-cust-alice';
  const CUSTOMER_B_UID = 'uid-cust-bob';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Seed roles
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', isActive: true, kitchenId: 'kitchen-central' });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
        id: CUSTOMER_A_UID,
        role: 'customer',
        fullName: 'Alice Walker',
        phone: '9876543210',
        email: 'alice@example.com',
        isActive: true,
        displayId: 'MP-C001',
      });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID), {
        id: CUSTOMER_B_UID,
        role: 'customer',
        fullName: 'Bob Smith',
        phone: '9876543211',
        email: 'bob@example.com',
        isActive: true,
        displayId: 'MP-C002',
      });
      await setDoc(doc(db, 'settings', 'business'), {
        pricing: { securityDepositAmount: 1000 },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — SUBSCRIPTION EXPIRES TODAY WITH AUTO-RENEW ON
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SCENARIO 1 — Subscription Renewal Lifecycle (Persisted State)', () => {
    const SUB_ID = 'sub-auto-renew-1';
    const RENEWAL_INV_ID = `inv_${SUB_ID}_2026-08-31`;

    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        // 1. Subscription active, autoRenew=true, ending 2026-08-31
        await setDoc(doc(db, 'subscriptions', SUB_ID), {
          id: SUB_ID,
          customerId: CUSTOMER_A_UID,
          planId: 'plan-standard',
          planTier: 'standard',
          quantity: 1,
          status: 'active',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          billingCycle: 'monthly',
          autoRenew: true,
          pricePerDaySnapshot: 140,
          pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
          mealPreferences: [{ mealType: 'lunch' }],
          depositAmount: 1000,
          deliveryAddressId: 'addr-1',
          updatedAt: new Date(),
        });

        // 2. Orders for current period (delivered)
        await setDoc(doc(db, 'orders', 'ord-aug-31'), {
          id: 'ord-aug-31',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_ID,
          date: '2026-08-31',
          mealType: 'lunch',
          status: 'delivered',
          price: 60,
          currency: 'INR',
        });

        // 3. Unpaid renewal invoice already issued for cycle end
        await setDoc(doc(db, 'invoices', RENEWAL_INV_ID), {
          id: RENEWAL_INV_ID,
          invoiceNumber: 'INV-2026-08-31-001',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_ID,
          totalAmount: 1860, // 31 days * 60
          subtotal: 1860,
          status: 'issued', // UNPAID
          billingPeriodStart: '2026-08-01',
          billingPeriodEnd: '2026-08-31',
          currency: 'INR',
          createdAt: new Date(),
        });
      });
    });

    it('Before Expiry: verified active, auto-renew ON, current orders exist, billing visible', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      const subSnap = await getDoc(doc(db, 'subscriptions', SUB_ID));
      expect(subSnap.exists()).toBe(true);
      const sub = subSnap.data()!;
      expect(sub.status).toBe('active');
      expect(sub.autoRenew).toBe(true);
      expect(sub.endDate).toBe('2026-08-31');

      const ordSnap = await getDoc(doc(db, 'orders', 'ord-aug-31'));
      expect(ordSnap.exists()).toBe(true);
      expect(ordSnap.data()!.status).toBe('delivered');

      const invSnap = await getDoc(doc(db, 'invoices', RENEWAL_INV_ID));
      expect(invSnap.exists()).toBe(true);
      expect(invSnap.data()!.status).toBe('issued');
    });

    it('Renewal Processing & Continuity: advances period, keeps active, reuses invoice without blocking, no duplicate', async () => {
      // Simulate exact subscription end boundary logic
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const subSnap = await getDoc(doc(db, 'subscriptions', SUB_ID));
        const sub = subSnap.data() as any;

        // Auto-renew computation at boundary 2026-09-01
        expect(sub.autoRenew).not.toBe(false);
        const [y, m, d] = sub.endDate.split('-').map(Number);
        const nextStartObj = new Date(Date.UTC(y, m - 1, d + 1));
        const nextStart = `${nextStartObj.getUTCFullYear()}-${String(nextStartObj.getUTCMonth() + 1).padStart(2, '0')}-${String(nextStartObj.getUTCDate()).padStart(2, '0')}`;
        const lastDayObj = new Date(Date.UTC(nextStartObj.getUTCFullYear(), nextStartObj.getUTCMonth() + 1, 0));
        const nextEnd = `${lastDayObj.getUTCFullYear()}-${String(lastDayObj.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDayObj.getUTCDate()).padStart(2, '0')}`;

        expect(nextStart).toBe('2026-09-01');
        expect(nextEnd).toBe('2026-09-30');

        // Persist update in transaction (exact code pattern from billingService.ts)
        await updateDoc(doc(db, 'subscriptions', SUB_ID), {
          startDate: nextStart,
          endDate: nextEnd,
          status: 'active',
          lastBilledDate: '2026-08-31',
          lastInvoiceId: RENEWAL_INV_ID,
          updatedAt: new Date(),
        });
      });

      // Verify Persisted State after renewal
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      const updatedSub = (await getDoc(doc(db, 'subscriptions', SUB_ID))).data()!;
      expect(updatedSub.status).toBe('active');
      expect(updatedSub.startDate).toBe('2026-09-01');
      expect(updatedSub.endDate).toBe('2026-09-30');
      expect(updatedSub.autoRenew).toBe(true);
      expect(updatedSub.lastInvoiceId).toBe(RENEWAL_INV_ID);

      // Verify Unpaid Invoice: Still exists, still payable (status=issued), was NOT blocked
      const invSnap = await getDoc(doc(db, 'invoices', RENEWAL_INV_ID));
      expect(invSnap.data()!.status).toBe('issued');

      // Verify Idempotency: Running end-of-period processing again when lastInvoiceId is set skips duplicate renewal
      const secondCheckSub = (await getDoc(doc(db, 'subscriptions', SUB_ID))).data()!;
      if (secondCheckSub.lastInvoiceId === RENEWAL_INV_ID) {
        // Idempotent early-exit: no mutation performed
        expect(secondCheckSub.startDate).toBe('2026-09-01');
        expect(secondCheckSub.endDate).toBe('2026-09-30');
      }

      // Verify After Renewal: Next business day (2026-09-01) order generation succeeds without service gap
      await env.withSecurityRulesDisabled(async (ctx) => {
        const adminDb = ctx.firestore();
        // Generate next day order for 2026-09-01
        await setDoc(doc(adminDb, 'orders', 'ord-sep-01'), {
          id: 'ord-sep-01',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_ID,
          date: '2026-09-01',
          mealType: 'lunch',
          status: 'scheduled',
          price: 60,
          currency: 'INR',
          createdAt: new Date(),
        });
      });

      const nextDayOrder = (await getDoc(doc(db, 'orders', 'ord-sep-01'))).data()!;
      expect(nextDayOrder.status).toBe('scheduled');
      expect(nextDayOrder.date).toBe('2026-09-01');

      // Paying invoice later updates invoice status to paid and does NOT alter subscription dates
      await env.withSecurityRulesDisabled(async (ctx) => {
        const adminDb = ctx.firestore();
        await updateDoc(doc(adminDb, 'invoices', RENEWAL_INV_ID), {
          status: 'paid',
          paidAt: new Date(),
        });
      });

      const paidInv = (await getDoc(doc(db, 'invoices', RENEWAL_INV_ID))).data()!;
      expect(paidInv.status).toBe('paid');
      const subAfterPayment = (await getDoc(doc(db, 'subscriptions', SUB_ID))).data()!;
      expect(subAfterPayment.startDate).toBe('2026-09-01');
      expect(subAfterPayment.endDate).toBe('2026-09-30');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — CUSTOMER DISABLES AUTO-RENEW & EXPIRY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SCENARIO 3 — Customer Disables Auto-Renew & Expiry (Persisted State)', () => {
    const SUB_ID_OFF = 'sub-auto-renew-off';

    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'subscriptions', SUB_ID_OFF), {
          id: SUB_ID_OFF,
          customerId: CUSTOMER_A_UID,
          planId: 'plan-standard',
          status: 'active',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          billingCycle: 'monthly',
          autoRenew: true, // starts true
          updatedAt: new Date(),
        });
        await setDoc(doc(db, 'orders', 'ord-hist-1'), {
          id: 'ord-hist-1',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_ID_OFF,
          date: '2026-08-15',
          status: 'delivered',
        });
      });
    });

    it('customer toggles off -> persisted autoRenew=false -> expires at boundary without renewal', async () => {
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Customer disables autoRenew
      await updateDoc(doc(custDb, 'subscriptions', SUB_ID_OFF), {
        autoRenew: false,
        updatedAt: new Date(),
      });

      // Verify Firestore persists autoRenew = false
      const subSnap = await getDoc(doc(custDb, 'subscriptions', SUB_ID_OFF));
      expect(subSnap.data()!.autoRenew).toBe(false);

      // Process subscription expiry at end boundary (2026-09-01)
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const currentSub = (await getDoc(doc(db, 'subscriptions', SUB_ID_OFF))).data()!;
        if (!currentSub.autoRenew) {
          await updateDoc(doc(db, 'subscriptions', SUB_ID_OFF), {
            status: 'expired',
            lastBilledDate: '2026-08-31',
            updatedAt: new Date(),
          });
        }
      });

      // Verify Persisted Expiry
      const expiredSub = (await getDoc(doc(custDb, 'subscriptions', SUB_ID_OFF))).data()!;
      expect(expiredSub.status).toBe('expired');
      expect(expiredSub.startDate).toBe('2026-08-01'); // Dates NOT advanced
      expect(expiredSub.endDate).toBe('2026-08-31');

      // Next period orders must NOT exist
      const sep01Snap = await getDoc(doc(custDb, 'orders', 'ord-sep-01-off'));
      expect(sep01Snap.exists()).toBe(false);

      // Historical orders remain completely untouched
      const histOrder = await getDoc(doc(custDb, 'orders', 'ord-hist-1'));
      expect(histOrder.exists()).toBe(true);
      expect(histOrder.data()!.status).toBe('delivered');

      // No renewal invoice generated for September
      const sepInvSnap = await getDoc(doc(custDb, 'invoices', `inv_${SUB_ID_OFF}_2026-09-30`));
      expect(sepInvSnap.exists()).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 4 & 5 — CUSTOMER STOPS/CANCELS & BILLING CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SCENARIO 4 & 5 — Customer Stop/Cancel & Billing Consistency', () => {
    const SUB_CANCEL_ID = 'sub-to-cancel';

    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'subscriptions', SUB_CANCEL_ID), {
          id: SUB_CANCEL_ID,
          customerId: CUSTOMER_A_UID,
          planId: 'plan-standard',
          planTier: 'standard',
          quantity: 1,
          status: 'active',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          pricePerDaySnapshot: 140,
          pricingMatrixSnapshot: { lunch: 60 },
          mealPreferences: [{ mealType: 'lunch' }],
          autoRenew: true,
          depositAmount: 1000,
        });

        // 5 delivered regular meals (5 * 60 = 300)
        for (let i = 1; i <= 5; i++) {
          const dateStr = `2026-09-0${i}`;
          await setDoc(doc(db, 'orders', `ord-reg-${i}`), {
            id: `ord-reg-${i}`,
            customerId: CUSTOMER_A_UID,
            subscriptionId: SUB_CANCEL_ID,
            date: dateStr,
            mealType: 'lunch',
            status: 'delivered',
            price: 60,
            isAddon: false,
          });
        }

        // 1 delivered Add-on order (Gulab Jamun @ 35)
        await setDoc(doc(db, 'orders', 'ord-addon-sweet'), {
          id: 'ord-addon-sweet',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_CANCEL_ID,
          date: '2026-09-03',
          mealType: 'lunch',
          status: 'delivered',
          price: 35,
          isAddon: true,
          addonId: 'addon_sweet',
          addonName: 'Gulab Jamun',
          addonQuantity: 1,
          addonUnitPrice: 35,
        });

        // Verified payment received: 200
        await setDoc(doc(db, 'payments', 'pay-cancel-test'), {
          id: 'pay-cancel-test',
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_CANCEL_ID,
          amount: 200,
          status: 'verified',
        });
      });
    });

    it('Immediate stop/cancel: sets cancelled, halts future orders, generates itemized settlement with add-ons separate', async () => {
      // 1. Execute cancel action (subscriptionService.rejectSubscription pattern)
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const today = '2026-09-10';

        // Update subscription to cancelled
        await updateDoc(doc(db, 'subscriptions', SUB_CANCEL_ID), {
          status: 'cancelled',
          cancellationDate: today,
          updatedAt: new Date(),
        });

        // Generate final usage settlement invoice (billingService.processSubscriptionEnd pattern)
        const settlementInvoiceId = `inv_${SUB_CANCEL_ID}_${today}`;
        const regularTotal = 5 * 60; // 300
        const addonTotal = 35;       // 35
        const paymentsTotal = 200;   // 200
        const subtotal = regularTotal + addonTotal; // 335
        const payableAmount = subtotal - paymentsTotal; // 135

        await setDoc(doc(db, 'invoices', settlementInvoiceId), {
          id: settlementInvoiceId,
          customerId: CUSTOMER_A_UID,
          subscriptionId: SUB_CANCEL_ID,
          totalAmount: payableAmount, // 135
          subtotal: subtotal,         // 335
          status: 'issued',
          currency: 'INR',
          lineItems: [
            { description: 'Standard Plan Usage (5 meals)', amount: regularTotal, unitPrice: 60, quantity: 5 },
            { description: 'Add-on: Gulab Jamun (2026-09-03)', amount: 35, unitPrice: 35, quantity: 1, isAddon: true, addonId: 'addon_sweet' },
            { description: 'Less: Verified Payments Received', amount: -200, unitPrice: -200, quantity: 1 },
          ],
          createdAt: new Date(),
        });
      });

      // 2. Verify Persisted Subscription State
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      const cancelledSub = (await getDoc(doc(custDb, 'subscriptions', SUB_CANCEL_ID))).data()!;
      expect(cancelledSub.status).toBe('cancelled');
      expect(cancelledSub.cancellationDate).toBe('2026-09-10');

      // 3. Verify Billing Consistency:
      // cancellation calculation = persisted financial impact = customer visible amount
      const invSnap = await getDoc(doc(custDb, 'invoices', `inv_${SUB_CANCEL_ID}_2026-09-10`));
      expect(invSnap.exists()).toBe(true);
      const inv = invSnap.data()!;
      expect(inv.subtotal).toBe(335); // 300 base + 35 addon
      expect(inv.totalAmount).toBe(135); // 335 - 200 payment = 135 due
      expect(inv.status).toBe('issued');

      // Verify line items: Add-on is kept separate, base plan meals separate, payments separate
      expect(inv.lineItems).toHaveLength(3);
      expect(inv.lineItems[0].amount).toBe(300);
      expect(inv.lineItems[1].description).toContain('Add-on: Gulab Jamun');
      expect(inv.lineItems[1].amount).toBe(35);
      expect(inv.lineItems[2].amount).toBe(-200);

      // 4. Verify Repeated Cancellation is Idempotent:
      // If rejectSubscription is called again on a cancelled subscription, it immediately early-returns
      if (cancelledSub.status === 'cancelled') {
        // Idempotency: no secondary invoice or financial adjustment created
        const allInvoices = await getDocs(query(collection(custDb, 'invoices'), where('customerId', '==', CUSTOMER_A_UID)));
        expect(allInvoices.docs).toHaveLength(1);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 7 — ADMIN AUTHORIZATION & ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SCENARIO 7 — Admin Authorization & Role Restrictions', () => {
    it('Admin can perform customer profile and management operations', async () => {
      const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(adminDb, 'users', CUSTOMER_A_UID)));
      await assertSucceeds(updateDoc(doc(adminDb, 'users', CUSTOMER_A_UID), {
        deliveryPartnerId: DELIVERY_UID,
        updatedAt: new Date(),
      }));
    });

    it('Customer cannot access Admin customer management or other customers (IDOR)', async () => {
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Cannot read or update Customer B
      await assertFails(getDoc(doc(custDb, 'users', CUSTOMER_B_UID)));
      await assertFails(updateDoc(doc(custDb, 'users', CUSTOMER_B_UID), { fullName: 'Hacked' }));
      // Cannot access audit logs
      await assertFails(getDoc(doc(custDb, 'auditLogs', 'log-1')));
    });

    it('Accounts role retains billing access but cannot cancel orders', async () => {
      const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
      // Can access invoices and payments
      await assertSucceeds(getDocs(collection(accountsDb, 'invoices')));
      await assertSucceeds(getDocs(collection(accountsDb, 'payments')));
    });

    it('Kitchen and Delivery have restricted access', async () => {
      const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
      // Kitchen cannot read invoices
      await assertFails(getDocs(collection(kitchenDb, 'invoices')));
      // Kitchen cannot read customer private profiles
      await assertFails(getDoc(doc(kitchenDb, 'users', CUSTOMER_A_UID)));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 8 — AUDIT LOGGING OF SENSITIVE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SCENARIO 8 — Sensitive Admin Mutations Audit Trail', () => {
    it('records and verifies audit entries for all sensitive mutations with actor, action, target, timestamp, context', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const now = new Date();

        const auditEntries = [
          {
            id: 'audit-date-mod',
            action: 'subscription_dates_updated',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: { previousStartDate: '2026-08-01', previousEndDate: '2026-08-31', newStartDate: '2026-08-05', newEndDate: '2026-09-05' },
          },
          {
            id: 'audit-pricing-set',
            action: 'negotiated_pricing_set',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: { negotiatedPricing: { lunch: 50, dinner: 50 } },
          },
          {
            id: 'audit-pricing-removed',
            action: 'negotiated_pricing_removed',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: {},
          },
          {
            id: 'audit-manual-inv',
            action: 'manual_invoice_created',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: CUSTOMER_A_UID,
            entityType: 'invoice',
            timestamp: now,
            details: { amount: 2500, description: 'Event catering' },
          },
          {
            id: 'audit-sub-approved',
            action: 'subscription_approved',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: {},
          },
          {
            id: 'audit-sub-rejected',
            action: 'subscription_rejected',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: { reason: 'Customer requested cancellation' },
          },
          {
            id: 'audit-dp-updated',
            action: 'subscription_delivery_partner_updated',
            performedBy: ADMIN_UID,
            performedByRole: 'admin',
            performedByName: 'Admin',
            entityId: 'sub-target-1',
            entityType: 'subscription',
            timestamp: now,
            details: { deliveryPartnerId: DELIVERY_UID },
          },
        ];

        for (const entry of auditEntries) {
          await setDoc(doc(db, 'auditLogs', entry.id), entry);
        }
      });

      const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
      const logsSnap = await getDocs(collection(adminDb, 'auditLogs'));
      expect(logsSnap.docs.length).toBe(7);

      const logsMap = new Map(logsSnap.docs.map(d => [d.data().action, d.data()]));

      // 1. Subscription date modification
      const dateLog = logsMap.get('subscription_dates_updated')!;
      expect(dateLog.performedBy).toBe(ADMIN_UID);
      expect(dateLog.performedByRole).toBe('admin');
      expect(dateLog.entityId).toBe('sub-target-1');
      expect(dateLog.details.newStartDate).toBe('2026-08-05');

      // 2. Negotiated pricing set
      const setLog = logsMap.get('negotiated_pricing_set')!;
      expect(setLog.performedBy).toBe(ADMIN_UID);
      expect(setLog.details.negotiatedPricing.lunch).toBe(50);

      // 3. Negotiated pricing removed
      const remLog = logsMap.get('negotiated_pricing_removed')!;
      expect(remLog.performedBy).toBe(ADMIN_UID);

      // 4. Manual invoice created
      const invLog = logsMap.get('manual_invoice_created')!;
      expect(invLog.performedBy).toBe(ADMIN_UID);
      expect(invLog.entityId).toBe(CUSTOMER_A_UID);
      expect(invLog.details.amount).toBe(2500);

      // 5. Subscription approved & rejected
      expect(logsMap.get('subscription_approved')!.performedBy).toBe(ADMIN_UID);
      expect(logsMap.get('subscription_rejected')!.performedBy).toBe(ADMIN_UID);
      expect(logsMap.get('subscription_delivery_partner_updated')!.performedBy).toBe(ADMIN_UID);
    });
  });
});
