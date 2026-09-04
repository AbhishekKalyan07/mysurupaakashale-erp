process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as repositories from '../../functions/src/repositories';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

vi.mock('firebase-functions/logger', () => ({
  warn: vi.fn(),
  info: vi.fn()
}));

beforeAll(() => {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'demo-test' });
  }
});

describe('repositories.ts', () => {
  describe('createRepo (using userRepository as proxy)', () => {
    it('creates, gets, updates and lists data accurately', async () => {
      // Create
      const docId = await repositories.userRepository.create({ name: 'IntegrationTestUser', age: 30 });
      expect(docId).toBeDefined();

      // Get
      let user = await repositories.userRepository.getById(docId);
      expect(user).toBeDefined();
      expect(user.name).toBe('IntegrationTestUser');

      // Update
      await repositories.userRepository.update(docId, { age: 31 });
      user = await repositories.userRepository.getById(docId);
      expect(user.age).toBe(31);

      // List
      const users = await repositories.userRepository.list({ field: 'name', op: '==', val: 'IntegrationTestUser' });
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toBe('IntegrationTestUser');
      
      // Get missing
      const missing = await repositories.userRepository.getById('non_existent_id_123');
      expect(missing).toBeNull();
    });

    it('create with explicit ID works', async () => {
      const customId = 'custom_user_id_' + Date.now();
      await repositories.userRepository.create({ name: 'CustomIDUser' }, customId);
      const user = await repositories.userRepository.getById(customId);
      expect(user.name).toBe('CustomIDUser');
      expect(user.id).toBe(customId);
    });
  });

  describe('Specific Repositories', () => {
    it('orderRepository.getCustomerOrdersInRange', async () => {
      const cId = 'customer_range_' + Date.now();
      await repositories.orderRepository.create({ customerId: cId, date: '2026-08-10', total: 100 });
      await repositories.orderRepository.create({ customerId: cId, date: '2026-08-15', total: 200 });
      await repositories.orderRepository.create({ customerId: cId, date: '2026-09-01', total: 300 }); // Out of range

      const res = await repositories.orderRepository.getCustomerOrdersInRange(cId, '2026-08-01', '2026-08-31');
      expect(res.length).toBe(2);
      expect(res.map((r: any) => r.total).sort()).toEqual([100, 200]);
    });

    it('paymentRepository.getByCustomerId', async () => {
      const cId = 'customer_pay_' + Date.now();
      await getFirestore().collection('payments').add({ customerId: cId, amount: 50 });
      
      const res = await repositories.paymentRepository.getByCustomerId(cId);
      expect(res.length).toBe(1);
      expect((res[0] as any).amount).toBe(50);
    });

    it('holidayRepository.isHoliday', async () => {
      const date = '2026-10-15';
      await getFirestore().collection('holidays').add({ date, status: 'active' });
      
      const res1 = await repositories.holidayRepository.isHoliday(date);
      expect(res1).toBe(true);

      const res2 = await repositories.holidayRepository.isHoliday('2026-10-16');
      expect(res2).toBe(false);
    });

    it('auditRepository.logAction', async () => {
      await repositories.auditRepository.logAction('cancel', 'e1', 'order', 'u1', 'admin', { detail: 'ok' });
      
      const snaps = await getFirestore().collection('auditLogs').where('action', '==', 'cancel').where('entityId', '==', 'e1').get();
      expect(snaps.empty).toBe(false);
      expect(snaps.docs[0].data().performedBy).toBe('u1');
    });

    it('failureQueueRepository.logFailure', async () => {
      await repositories.failureQueueRepository.logFailure('c1', 's1', 'lunch', '2026-09-01', 'Error', 'stack');
      
      const snaps = await getFirestore().collection('failureQueue').where('customerId', '==', 'c1').get();
      expect(snaps.empty).toBe(false);
      expect(snaps.docs[0].data().reason).toBe('Error');
    });
  });

  describe('transactionRepository', () => {
    it('runTransaction orchestrates getting and setting', async () => {
      const docRef = getFirestore().collection('txnTest').doc('t1');
      await docRef.set({ val: 1 });

      await repositories.transactionRepository.runTransaction(async (txn) => {
        const res = await txn.get({ path: docRef.path });
        expect(res.val).toBe(1);
        
        txn.set({ path: docRef.path }, { val: 2 });
      });

      const updated = await docRef.get();
      expect(updated.data()?.val).toBe(2);
    });
  });

  describe('notificationService', () => {
    it('notifyAdminAlert logs a warning', async () => {
      await repositories.notificationService.notifyAdminAlert(['a1'], 'Title', 'Message');
      expect(logger.warn).toHaveBeenCalledWith('[Admin Alert] Title: Message');
    });

    it('notifyOrderGeneratedCustomer logs info', async () => {
      await repositories.notificationService.notifyOrderGeneratedCustomer('c1', 'o1', 'lunch', '2026-09-01');
      expect(logger.info).toHaveBeenCalledWith('Customer notification: order o1 generated.');
    });

    it('notifyOrderGeneratedDriver logs info', async () => {
      await repositories.notificationService.notifyOrderGeneratedDriver('d1', 'o1', 'lunch');
      expect(logger.info).toHaveBeenCalledWith('Driver notification: order o1 generated.');
    });

    it('notifyDailyOrdersGenerated logs info', async () => {
      await repositories.notificationService.notifyDailyOrdersGenerated(['a1'], '2026-09-01', 50);
      expect(logger.info).toHaveBeenCalledWith('Admin notification: 50 daily orders generated for 2026-09-01.');
    });
  });
});
