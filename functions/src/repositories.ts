import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

const getDb = () => getFirestore();

const createRepo = <T = any>(collectionName: string) => ({
  getById: async (id: string): Promise<T | null> => {
    const snap = await getDb().collection(collectionName).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } as T : null;
  },
  list: async (...constraints: any[]): Promise<T[]> => {
    let q: any = getDb().collection(collectionName);
    for (const c of constraints) {
      q = q.where(c.field, c.op, c.val);
    }
    const snap = await q.get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as T);
  },
  update: async (id: string, data: any) => {
    await getDb().collection(collectionName).doc(id).update({
      ...data,
      updatedAt: FieldValue.serverTimestamp()
    });
  },
  create: async (data: any, id?: string) => {
    if (id) {
      await getDb().collection(collectionName).doc(id).set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return id;
    } else {
      const ref = await getDb().collection(collectionName).add({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return ref.id;
    }
  }
});

import type { Order, Subscription, CustomerProfile, DeliveryPartnerProfile, MealPlan } from './types';

export const orderRepository = {
  ...createRepo<Order>('orders'),
  getCustomerOrdersInRange: async (customerId: string, startDate: string, endDate: string) => {
    const snap = await getDb().collection('orders')
      .where('customerId', '==', customerId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Order);
  }
};
export const subscriptionRepository = createRepo<Subscription>('subscriptions');
export const orderGenerationRunRepository = createRepo('orderGenerationRuns');
export const userRepository = createRepo<CustomerProfile | DeliveryPartnerProfile | any>('users');
export const mealPlanRepository = createRepo<MealPlan>('mealPlans');
export const kitchenRepository = createRepo('kitchens');
export const deliveryZoneRepository = createRepo('deliveryZones');
export const paymentRepository = {
  getByCustomerId: async (customerId: string) => {
    const snap = await getDb().collection('payments').where('customerId', '==', customerId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};

export const transactionRepository = {
  runTransaction: async (callback: (txn: any) => Promise<void>) => {
    return getDb().runTransaction(async (t) => {
      const txn = {
        get: async (docRef: { path: string }) => {
          const snap = await t.get(getDb().doc(docRef.path));
          return snap.exists ? snap.data() : null;
        },
        set: (docRef: { path: string }, data: any) => {
          t.set(getDb().doc(docRef.path), data, { merge: true });
        }
      };
      await callback(txn);
    });
  }
};

export const holidayRepository = {
  isHoliday: async (date: string) => {
    const snap = await getDb().collection('holidays').where('date', '==', date).where('status', '==', 'active').get();
    return !snap.empty;
  }
};

export const auditRepository = {
  logAction: async (action: string, entityId: string, entityType: string, performedBy: string, performedByRole: string, details: any) => {
    await getDb().collection('auditLogs').add({
      action,
      entityId,
      entityType,
      performedBy,
      performedByRole,
      details,
      timestamp: FieldValue.serverTimestamp()
    });
  }
};

export const failureQueueRepository = {
  logFailure: async (customerId: string, subscriptionId: string, mealType: string, date: string, reason: string, stack?: string) => {
    await getDb().collection('failureQueue').add({
      customerId,
      subscriptionId,
      mealType,
      date,
      reason,
      stack,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
  }
};

export const notificationService = {
  notifyAdminAlert: async (adminIds: string[], title: string, message: string) => {
    logger.warn(`[Admin Alert] ${title}: ${message}`);
  },
  notifyOrderGeneratedCustomer: async (customerId: string, orderId: string, mealType: string, date: string) => {
    // In backend we can skip some fine-grained notifications if we want, or implement them properly.
    // The client was inserting into notifications collection. We can do that here.
    logger.info(`Customer notification: order ${orderId} generated.`);
  },
  notifyOrderGeneratedDriver: async (driverId: string, orderId: string, mealType: string) => {
    logger.info(`Driver notification: order ${orderId} generated.`);
  },
  notifyDailyOrdersGenerated: async (adminIds: string[], date: string, count: number) => {
    logger.info(`Admin notification: ${count} daily orders generated for ${date}.`);
  }
};
