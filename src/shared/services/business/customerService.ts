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

    const cleanPartnerId =
      partnerId && partnerId.trim() !== "" ? partnerId.trim() : null;

    const [customer, partner] = await Promise.all([
      userRepository.getById(customerId),
      cleanPartnerId ? userRepository.getById(cleanPartnerId) : Promise.resolve(null),
    ]);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }

    if (cleanPartnerId) {
      if (!partner || partner.role !== "delivery_partner") {
        throw new Error(
          `Delivery partner with ID ${cleanPartnerId} not found or invalid role.`,
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
        ? currentMealPartners[mealType] !== undefined
          ? currentMealPartners[mealType]
          : custProfile.deliveryPartnerId || null
        : custProfile.deliveryPartnerId || null;

    // Idempotency check
    if (mealType && mealType !== "all") {
      const existingMealVal =
        currentMealPartners[mealType] === undefined
          ? null
          : currentMealPartners[mealType];
      if (existingMealVal === cleanPartnerId) return;
    } else {
      if (oldPartnerId === cleanPartnerId && !custProfile.mealDeliveryPartners) {
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
      newMealPartners[mealType] = cleanPartnerId; // null represents inherit/unassigned
      updatePayload.mealDeliveryPartners = newMealPartners;
    } else {
      updatePayload.deliveryPartnerId = cleanPartnerId;
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
      cleanPartnerId ? "delivery_partner_assigned" : "delivery_partner_unassigned",
      adminId,
      "admin",
      adminName,
      customerId,
      "user",
      {
        oldPartnerId,
        newPartnerId: cleanPartnerId,
        newPartnerName: partner ? partner.fullName : "Unassigned",
        mealType: mealType || "all",
      },
    );
  }

  /**
   * Assigns a delivery zone permanently to a customer.
   * Passing a null or empty zoneId clears manual override, reverting to pincode auto-routing.
   * All future orders generated for this customer will inherit this zone assignment.
   */
  async assignCustomerZone(
    customerId: string,
    zoneId: string | null,
    adminId: string,
    adminName: string,
  ): Promise<void> {
    if (!customerId) {
      throw new Error("Customer ID is required.");
    }

    const cleanZoneId =
      zoneId && zoneId.trim() !== "" ? zoneId.trim() : null;

    const [customer, zone] = await Promise.all([
      userRepository.getById(customerId),
      cleanZoneId
        ? (async () => {
            const { deliveryZoneRepository } = await import(
              "../firestore/deliveryZoneRepository"
            );
            return deliveryZoneRepository.getById(cleanZoneId);
          })()
        : Promise.resolve(null),
    ]);

    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }

    if (cleanZoneId) {
      if (!zone) {
        throw new Error(`Delivery zone with ID ${cleanZoneId} not found.`);
      }
      if (!zone.isActive) {
        throw new Error(`Cannot assign inactive delivery zone "${zone.name}".`);
      }
    }

    const oldZoneId = (customer as CustomerProfile).zoneId || null;

    // Idempotency check
    if (oldZoneId === cleanZoneId) {
      return;
    }

    // Update the customer record
    await userRepository.update(customerId, {
      zoneId: cleanZoneId,
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
      cleanZoneId ? "customer_zone_assigned" : "customer_zone_unassigned",
      adminId,
      "admin",
      adminName,
      customerId,
      "user",
      {
        oldZoneId,
        newZoneId: cleanZoneId,
      },
    );
  }
}

export const customerService = new CustomerService();
