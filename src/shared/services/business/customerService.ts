import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { userRepository } from '../firestore/userRepository';
import { auditRepository } from '../firestore/auditRepository';
import type { CustomerProfile } from '@/shared/types';

class CustomerService {
  /**
   * Assigns a delivery partner permanently to a customer.
   * All future orders generated for this customer will inherit this assignment.
   */
  async assignDeliveryPartner(
    customerId: string,
    partnerId: string,
    adminId: string,
    adminName: string
  ): Promise<void> {
    if (!customerId || !partnerId) {
      throw new Error('Customer ID and Partner ID are required.');
    }

    const [customer, partner] = await Promise.all([
      userRepository.getById(customerId),
      userRepository.getById(partnerId)
    ]);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }
    
    if (!partner || partner.role !== 'delivery_partner') {
      throw new Error(`Delivery partner with ID ${partnerId} not found or invalid role.`);
    }
    
    if (!partner.isActive) {
      throw new Error(`Cannot assign inactive delivery partner ${partner.fullName}.`);
    }

    const oldPartnerId = (customer as CustomerProfile).deliveryPartnerId || null;

    // Idempotency check
    if (oldPartnerId === partnerId) {
      return;
    }

    // Update the customer record
    await userRepository.update(customerId, {
      deliveryPartnerId: partner.id,
      assignedAt: serverTimestamp() as unknown as Timestamp,
      assignedBy: adminId,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    } as any);
    
    // Synchronize today's active orders with the new partner
    const { orderService } = await import('@/shared/services/business/orderService');
    await orderService.syncCustomerActiveOrders(customerId);

    // Create an audit log
    await auditRepository.logAction(
      'delivery_partner_assigned',
      adminId,
      adminName,
      customerId,
      'user',
      {
        oldPartnerId,
        newPartnerId: partner.id,
        newPartnerName: partner.fullName
      }
    );
  }

  /**
   * Assigns a delivery zone permanently to a customer.
   * All future orders generated for this customer will inherit this zone assignment.
   */
  async assignCustomerZone(
    customerId: string,
    zoneId: string,
    adminId: string,
    adminName: string
  ): Promise<void> {
    if (!customerId || !zoneId) {
      throw new Error('Customer ID and Zone ID are required.');
    }

    const customer = await userRepository.getById(customerId);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }
    
    const oldZoneId = (customer as CustomerProfile).zoneId || null;

    // Idempotency check
    if (oldZoneId === zoneId) {
      return;
    }

    // Update the customer record
    await userRepository.update(customerId, {
      zoneId,
      assignedAt: serverTimestamp() as unknown as Timestamp,
      assignedBy: adminId,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    } as any);

    // Synchronize today's active orders with the new zone
    const { orderService } = await import('@/shared/services/business/orderService');
    await orderService.syncCustomerActiveOrders(customerId);

    // Create an audit log
    await auditRepository.logAction(
      'customer_zone_assigned',
      adminId,
      adminName,
      customerId,
      'user',
      {
        oldZoneId,
        newZoneId: zoneId
      }
    );
  }
}

export const customerService = new CustomerService();
