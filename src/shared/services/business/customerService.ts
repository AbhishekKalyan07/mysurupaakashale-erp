import { serverTimestamp } from 'firebase/firestore';
import { userRepository } from '../firestore/userRepository';

class CustomerService {
  /**
   * Activate a customer profile.
   */
  async activateCustomer(customerId: string): Promise<void> {
    await userRepository.update(customerId, {
      isActive: true,
      updatedAt: serverTimestamp() as any,
    });
  }

  /**
   * Deactivate a customer profile.
   */
  async deactivateCustomer(customerId: string): Promise<void> {
    await userRepository.update(customerId, {
      isActive: false,
      updatedAt: serverTimestamp() as any,
    });
  }

  /**
   * Update customer profile details.
   */
  async updateCustomerProfile(customerId: string, data: { name?: string; phone?: string }): Promise<void> {
    await userRepository.update(customerId, {
      ...data,
      updatedAt: serverTimestamp() as any,
    });
  }
}

export const customerService = new CustomerService();
