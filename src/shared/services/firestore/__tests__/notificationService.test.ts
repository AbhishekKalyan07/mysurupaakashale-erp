import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as notificationService from '../notificationService';
import { notificationRepository } from '../notificationRepository';

vi.mock('../notificationRepository', () => ({
  notificationRepository: {
    createNotification: vi.fn(),
  },
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-admin-uid' },
  },
}));

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Subscription Notifications', () => {
    it('notifySubscriptionCreated', async () => {
      await notificationService.notifySubscriptionCreated('cust-1', 'sub-1', 'Premium');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cust-1',
          recipientRole: 'customer',
          type: 'subscription_created',
          relatedEntityType: 'subscription',
          relatedEntityId: 'sub-1',
          priority: 'normal',
        })
      );
    });

    it('notifySubscriptionActivated', async () => {
      await notificationService.notifySubscriptionActivated('cust-1', 'sub-1', 'Premium', '2026-08-01');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cust-1',
          type: 'subscription_activated',
          priority: 'high',
        })
      );
    });

    it('notifySubscriptionRenewalReminder - high urgency', async () => {
      await notificationService.notifySubscriptionRenewalReminder('cust-1', 'sub-1', 1, '2026-08-02');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_renewal_reminder',
          priority: 'high',
        })
      );
    });

    it('notifySubscriptionRenewalReminder - normal urgency', async () => {
      await notificationService.notifySubscriptionRenewalReminder('cust-1', 'sub-1', 3, '2026-08-05');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'normal' })
      );
    });

    it('notifySubscriptionRenewalReminder - low urgency', async () => {
      await notificationService.notifySubscriptionRenewalReminder('cust-1', 'sub-1', 5, '2026-08-07');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'low' })
      );
    });

    it('notifySubscriptionExpired', async () => {
      await notificationService.notifySubscriptionExpired('cust-1', 'sub-1');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'high', type: 'subscription_renewal_reminder' })
      );
    });

    it('notifySubscriptionPaused', async () => {
      await notificationService.notifySubscriptionPaused('cust-1', 'sub-1');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'subscription_paused' })
      );
    });

    it('notifySubscriptionResumed', async () => {
      await notificationService.notifySubscriptionResumed('cust-1', 'sub-1');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'subscription_resumed', priority: 'high' })
      );
    });

    it('notifySubscriptionRejected with reason', async () => {
      await notificationService.notifySubscriptionRejected('cust-1', 'sub-1', 'Invalid area');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_cancelled',
          message: expect.stringContaining('Invalid area'),
        })
      );
    });

    it('notifySubscriptionRejected without reason', async () => {
      await notificationService.notifySubscriptionRejected('cust-1', 'sub-1');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_cancelled',
          message: expect.stringContaining("couldn't be approved"),
        })
      );
    });
  });

  describe('Payment Notifications', () => {
    it('notifyPaymentSubmitted notifies customer and admins', async () => {
      await notificationService.notifyPaymentSubmitted('cust-1', 'pay-1', 1500, ['admin-1', 'admin-2']);
      expect(notificationRepository.createNotification).toHaveBeenCalledTimes(3);
      // Customer notification
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'cust-1', type: 'payment_submitted' })
      );
      // Admin notifications
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'admin-1', recipientRole: 'admin', type: 'payment_submitted', priority: 'high' })
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'admin-2', recipientRole: 'admin', type: 'payment_submitted', priority: 'high' })
      );
    });

    it('notifyPaymentVerified', async () => {
      await notificationService.notifyPaymentVerified('cust-1', 'pay-1', 1500);
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'payment_verified', priority: 'high' })
      );
    });

    it('notifyPaymentRejected with notes', async () => {
      await notificationService.notifyPaymentRejected('cust-1', 'pay-1', 1500, 'Blurry image');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_rejected',
          message: expect.stringContaining('Blurry image'),
        })
      );
    });

    it('notifyPaymentRejected without notes', async () => {
      await notificationService.notifyPaymentRejected('cust-1', 'pay-1', 1500, null);
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_rejected',
          message: expect.stringContaining('resubmit with the correct reference'),
        })
      );
    });
  });

  describe('Delivery Notifications', () => {
    it('notifyOrderOutForDelivery', async () => {
      await notificationService.notifyOrderOutForDelivery('cust-1', 'ord-1', 'lunch');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'out_for_delivery' })
      );
    });

    it('notifyOrderDelivered', async () => {
      await notificationService.notifyOrderDelivered('cust-1', 'ord-1', 'lunch');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delivered' })
      );
    });

    it('notifyDeliveryFailed', async () => {
      await notificationService.notifyDeliveryFailed('cust-1', 'ord-1', 'lunch');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delivery_failed', priority: 'high' })
      );
    });
  });

  describe('Kitchen / Operations Notifications', () => {
    it('notifyDailyOrdersGenerated notifies multiple staff', async () => {
      await notificationService.notifyDailyOrdersGenerated(['k-1', 'k-2'], '2026-08-02', 150);
      expect(notificationRepository.createNotification).toHaveBeenCalledTimes(2);
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'k-1',
          recipientRole: 'kitchen',
          type: 'daily_orders_generated',
          priority: 'high',
        })
      );
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'k-2',
          recipientRole: 'kitchen',
          type: 'daily_orders_generated',
          priority: 'high',
        })
      );
    });
  });

  describe('Staff / Admin Notifications', () => {
    it('notifyStaffAccountCreated', async () => {
      await notificationService.notifyStaffAccountCreated('staff-1', 'kitchen', 'John Doe');
      expect(notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'staff-1',
          recipientRole: 'kitchen',
          type: 'staff_account_created',
          priority: 'high',
        })
      );
    });
  });
  
  describe('Error handling (Fire and Forget boundary test)', () => {
    it('surfaces repository errors (since service does not swallow them locally)', async () => {
      vi.mocked(notificationRepository.createNotification).mockRejectedValueOnce(new Error('DB Error'));
      await expect(notificationService.notifySubscriptionCreated('cust-1', 'sub-1', 'Premium')).rejects.toThrow('DB Error');
    });
  });
});
