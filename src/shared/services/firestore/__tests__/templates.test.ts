import { describe, it, expect } from 'vitest';
import { NotificationTemplates } from '../templates';

describe('NotificationTemplates', () => {
  it('SubscriptionApproved', () => {
    const result = NotificationTemplates.SubscriptionApproved('Regular', '2026-08-01');
    expect(result.title).toBe('Subscription Approved!');
    expect(result.message).toContain('Regular');
    expect(result.message).toContain('2026-08-01');
  });

  it('DriverAssigned', () => {
    const result = NotificationTemplates.DriverAssigned('Ramesh', 'lunch');
    expect(result.title).toBe('Driver Assigned');
    expect(result.message).toContain('Ramesh');
    expect(result.message).toContain('lunch');
  });

  it('InvoiceGenerated', () => {
    const result = NotificationTemplates.InvoiceGenerated(1500, 'August 2026');
    expect(result.title).toBe('New Invoice Generated');
    expect(result.message).toContain('1500');
    expect(result.message).toContain('August 2026');
  });

  it('PaymentReminder', () => {
    const result = NotificationTemplates.PaymentReminder(1500, '2026-08-05');
    expect(result.title).toBe('Payment Reminder');
    expect(result.message).toContain('1500');
    expect(result.message).toContain('2026-08-05');
  });

  it('PaymentReceived', () => {
    const result = NotificationTemplates.PaymentReceived(1500);
    expect(result.title).toBe('Payment Received ✓');
    expect(result.message).toContain('1500');
  });

  it('OrderReady', () => {
    const result = NotificationTemplates.OrderReady('dinner');
    expect(result.title).toBe('Order Ready for Pickup');
    expect(result.message).toContain('dinner');
  });

  it('OrderDelivered', () => {
    const result = NotificationTemplates.OrderDelivered('breakfast');
    expect(result.title).toBe('Breakfast Delivered ✓');
    expect(result.message).toContain('breakfast');
  });
});
