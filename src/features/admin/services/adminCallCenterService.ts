import { auth } from "@/shared/lib/firebase";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import {
  orderService,
  type RemoveTodayMealResult,
  type ChangeTodayMealOptionResult,
  type AddTodayAddonResult,
} from "@/shared/services/business/orderService";
import { pricingService } from "@/shared/services/business/pricingService";
import { getTodayInTimezone } from "@/shared/lib/date";
import type { MealType } from "@/shared/types";

export interface AdminActor {
  uid: string;
  role: "admin";
  name: string;
}

export interface AdminAddTodayMealResult {
  success: boolean;
  count: number;
  orderId: string;
  mealType: MealType;
  date: string;
  price: number;
}

export class AdminCallCenterService {
  /**
   * Asserts that the current caller is authenticated and possesses the 'admin' role.
   * Throws an unauthorized error immediately if not an administrator.
   */
  async assertAdminCaller(): Promise<AdminActor> {
    const caller = auth.currentUser;
    if (!caller?.uid) {
      throw new Error("Unauthorized: Authentication required.");
    }
    const callerProfile = await userRepository.getById(caller.uid);
    if (!callerProfile || callerProfile.role !== "admin") {
      throw new Error(
        "Unauthorized: Only administrators can perform call-center operations on behalf of customers.",
      );
    }
    return {
      uid: caller.uid,
      role: "admin",
      name:
        callerProfile.fullName ||
        caller.displayName ||
        caller.email ||
        "Admin",
    };
  }

  /**
   * Removes today's meal on behalf of a calling customer.
   * Preserves cutoffs, locks, canonical cancellation pricing, idempotency, and logs audit.
   */
  async adminRemoveTodayMeal(
    subscriptionId: string,
    mealType: MealType,
    nowOverride?: Date,
  ): Promise<RemoveTodayMealResult> {
    const admin = await this.assertAdminCaller();
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const result = await orderService.removeTodayMeal(
      subscriptionId,
      mealType,
      nowOverride,
    );

    if (result.cancelled && result.orderId) {
      await auditRepository.logAction(
        "admin_today_meal_removed",
        admin.uid,
        admin.role,
        admin.name,
        result.orderId,
        "order",
        {
          action: "admin_today_meal_removed",
          performedByAdminId: admin.uid,
          performedByRole: admin.role,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          orderId: result.orderId,
          mealType,
          date: result.date,
          cancellationAmount: result.cancellationAmount,
          previousStatus: "scheduled",
          newStatus: "cancelled",
        },
      );
    }

    return result;
  }

  /**
   * Adds today's meal on behalf of a calling customer.
   * Preserves cutoffs, eligibility, authoritative pricing, idempotency, and logs audit.
   */
  async adminAddTodayMeal(
    subscriptionId: string,
    mealType: MealType,
    nowOverride?: Date,
  ): Promise<AdminAddTodayMealResult> {
    const admin = await this.assertAdminCaller();
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    const count = await orderService.addTodayMeal(
      subscriptionId,
      mealType,
      nowOverride,
    );

    const orderId = `ord_${subscription.id}_${today}_${mealType}`;
    const mealPrice = pricingService.calculateMealPrice(subscription, mealType);

    if (count > 0) {
      await auditRepository.logAction(
        "admin_today_meal_added",
        admin.uid,
        admin.role,
        admin.name,
        orderId,
        "order",
        {
          action: "admin_today_meal_added",
          performedByAdminId: admin.uid,
          performedByRole: admin.role,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          orderId,
          mealType,
          date: today,
          price: mealPrice,
          newStatus: "scheduled",
        },
      );
    }

    return {
      success: true,
      count,
      orderId,
      mealType,
      date: today,
      price: mealPrice,
    };
  }

  /**
   * Changes today's meal option for Lunch or Dinner on behalf of a calling customer.
   * Preserves same-slot restriction, plan slot options, ₹0 price variance, order ID immutability, and logs audit.
   */
  async adminChangeTodayMealOption(
    subscriptionId: string,
    mealType: MealType,
    newOptionId: string,
    nowOverride?: Date,
  ): Promise<ChangeTodayMealOptionResult> {
    const admin = await this.assertAdminCaller();
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const result = await orderService.changeTodayMealOption(
      subscriptionId,
      mealType,
      newOptionId,
      nowOverride,
    );

    if (result.changed) {
      await auditRepository.logAction(
        "admin_today_meal_option_changed",
        admin.uid,
        admin.role,
        admin.name,
        result.orderId,
        "order",
        {
          action: "admin_today_meal_option_changed",
          performedByAdminId: admin.uid,
          performedByRole: admin.role,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          orderId: result.orderId,
          mealType,
          date: result.date,
          previousOptionId: result.previousOptionId || null,
          newOptionId: result.newOptionId,
          previousMealName: result.previousMealName || null,
          newMealName: result.newMealName,
          priceDifference: 0,
        },
      );
    }

    return result;
  }

  /**
   * Adds an add-on item for today on behalf of a calling customer.
   * Preserves authoritative catalog pricing, transactional order + invoice line coupling, and logs audit.
   */
  async adminAddTodayAddon(
    subscriptionId: string,
    mealType: MealType,
    addonId: string,
    quantity: number = 1,
    nowOverride?: Date,
  ): Promise<AddTodayAddonResult> {
    const admin = await this.assertAdminCaller();
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const result = await orderService.addTodayAddon(
      subscriptionId,
      mealType,
      addonId,
      quantity,
      nowOverride,
    );

    if (result.success && !result.alreadyExists) {
      await auditRepository.logAction(
        "admin_today_addon_added",
        admin.uid,
        admin.role,
        admin.name,
        result.orderId,
        "order",
        {
          action: "admin_today_addon_added",
          performedByAdminId: admin.uid,
          performedByRole: admin.role,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          orderId: result.orderId,
          mealType,
          date: result.date,
          addonId: result.addonId,
          addonName: result.addonName,
          quantity: result.quantity,
          unitPrice: result.unitPrice,
          totalAmount: result.totalAmount,
          invoiceId: result.invoiceId,
        },
      );
    }

    return result;
  }
}

export const adminCallCenterService = new AdminCallCenterService();
