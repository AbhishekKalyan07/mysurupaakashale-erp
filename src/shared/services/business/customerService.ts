import { Timestamp, serverTimestamp } from "firebase/firestore";
import { userRepository } from "../firestore/userRepository";
import { auditRepository } from "../firestore/auditRepository";
import type { CustomerProfile, MealType } from "@/shared/types";

class CustomerService {
  /**
   * Assigns a delivery partner permanently to a customer for all meals or a specific meal type.
   * All future orders generated for this customer will inherit this assignment.
   */
  async assignDeliveryPartner(
    customerId: string,
    partnerId: string | null,
    adminId: string,
    adminName: string,
    mealType?: MealType | "all",
  ): Promise<void> {
    if (!customerId) {
      throw new Error("Customer ID is required.");
    }

    if (!partnerId && (!mealType || mealType === "all")) {
      throw new Error("Partner ID is required for global assignment.");
    }

    const [customer, partner] = await Promise.all([
      userRepository.getById(customerId),
      partnerId ? userRepository.getById(partnerId) : Promise.resolve(null),
    ]);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }

    if (partnerId) {
      if (!partner || partner.role !== "delivery_partner") {
        throw new Error(
          `Delivery partner with ID ${partnerId} not found or invalid role.`,
        );
      }

      if (!partner.isActive) {
        throw new Error(
          `Cannot assign inactive delivery partner ${partner.fullName}.`,
        );
      }
    }

    const custProfile = customer as CustomerProfile;
    const currentMealPartners = custProfile.mealDeliveryPartners || {};
    const oldPartnerId =
      mealType && mealType !== "all"
        ? currentMealPartners[mealType] !== undefined ? currentMealPartners[mealType] : custProfile.deliveryPartnerId || null
        : custProfile.deliveryPartnerId || null;

    // Idempotency check
    if (mealType && mealType !== "all") {
      const existingMealVal = currentMealPartners[mealType] === undefined ? null : currentMealPartners[mealType];
      if (existingMealVal === partnerId) return;
    } else {
      if (oldPartnerId === partnerId && !custProfile.mealDeliveryPartners) {
        return;
      }
    }

    const updatePayload: any = {
      assignedAt: serverTimestamp() as unknown as Timestamp,
      assignedBy: adminId,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    };

    if (mealType && mealType !== "all") {
      const newMealPartners = { ...currentMealPartners };
      if (partnerId === null) {
        newMealPartners[mealType] = null; // null represents unassigned/inherit explicitly
      } else {
        newMealPartners[mealType] = partnerId;
      }
      updatePayload.mealDeliveryPartners = newMealPartners;

      // If setting a specific meal and no global exists, we should probably still ensure it gets written correctly
      // But we don't modify deliveryPartnerId here.
    } else {
      updatePayload.deliveryPartnerId = partnerId;
      updatePayload.mealDeliveryPartners = null; // Clear all meal-specific overrides
    }

    // Update the customer record
    await userRepository.update(customerId, updatePayload);

    // Synchronize today's active orders with the new partner
    const { orderService } =
      await import("@/shared/services/business/orderService");
    if (mealType) {
      await orderService.syncCustomerActiveOrders(customerId, mealType);
    } else {
      await orderService.syncCustomerActiveOrders(customerId);
    }

    // Create an audit log
    await auditRepository.logAction(
      "delivery_partner_assigned",
      adminId,
      "admin",
      adminName,
      customerId,
      "user",
      {
        oldPartnerId,
        newPartnerId: partnerId,
        newPartnerName: partner ? partner.fullName : "Unassigned",
        mealType: mealType || "all",
      },
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
    adminName: string,
  ): Promise<void> {
    if (!customerId || !zoneId) {
      throw new Error("Customer ID and Zone ID are required.");
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
    const { orderService } =
      await import("@/shared/services/business/orderService");
    await orderService.syncCustomerActiveOrders(customerId);

    // Create an audit log
    await auditRepository.logAction(
      "customer_zone_assigned",
      adminId,
      "admin",
      adminName,
      customerId,
      "user",
      {
        oldZoneId,
        newZoneId: zoneId,
      },
    );
  }
}

export const customerService = new CustomerService();
