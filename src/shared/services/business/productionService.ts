import type { Order, MealType } from "@/shared/types";
import { formatAllottedId } from "@/shared/utils/displayId";

import { orderRepository } from "../firestore/orderRepository";
import { auditRepository } from "../firestore/auditRepository";

export interface ProductionProgress {
  total: number;
  packing: number;
  packed: number;
  ready: number;
  scheduled: number;
  cancelled: number;
  completionPercentage: number;
}

export interface ProductionSummary {
  breakfast: number;
  lunch: number;
  dinner: number;
  total: number;
}

export interface PlanSummary {
  basic: number;
  regular: number;
  oneTime: number;
}

export interface MealBreakdownItem {
  itemName: string;
  count: number;
}

export interface OrderDetail {
  id: string;
  displayId: string;
  customerName: string;
  mealType: string;
  mealName: string;
  quantity: number;
  specialInstructions?: string;
  packingNotes?: string;
}

export interface SpecialHandlingOrderEntry {
  id: string;
  displayId: string;
  customerName: string;
  mealType: string;
  mealName: string;
  quantity: number;
  area: string;
  zoneId?: string | null;
  specialInstructions?: string;
  packingNotes?: string;
}

export interface AreaPackingGroup {
  areaName: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  basic: number;
  regular: number;
  oneTime: number;
  specialHandlingCount: number;
  orders: OrderDetail[];
}

export interface PrintPackingRow {
  orderId: string;
  displayId: string;
  area: string;
  customerName: string;
  mealType: string;
  meal: string;
  quantity: number;
  plan: string;
  deliveryPartner: string;
  specialInstructions?: string;
  packingNotes?: string;
}

export class ProductionService {
  /**
   * Summarizes total meal counts by meal type.
   */
  static getProductionSummary(orders: Order[]): ProductionSummary {
    let breakfast = 0;
    let lunch = 0;
    let dinner = 0;

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;
      const qty = o.mealQuantity || 1;
      if (o.mealType === "breakfast") breakfast += qty;
      else if (o.mealType === "lunch") lunch += qty;
      else if (o.mealType === "dinner") dinner += qty;
    }

    return { breakfast, lunch, dinner, total: breakfast + lunch + dinner };
  }

  /**
   * Summarizes order counts by Plan Tier (or one-time).
   */
  static getPlanSummary(orders: Order[]): PlanSummary {
    let basic = 0;
    let regular = 0;
    let oneTime = 0;

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;
      const qty = o.mealQuantity || 1;
      if (o.source === "one_time") {
        oneTime += qty;
      } else if (o.planTier === "basic") {
        basic += qty;
      } else if (o.planTier === "regular") {
        regular += qty;
      }
    }

    return { basic, regular, oneTime };
  }

  /**
   * Breaks down EXACT item counts per meal type (e.g. 40 Idli, 25 Dose)
   */
  static getMealBreakdown(
    orders: Order[],
    mealType: MealType,
  ): MealBreakdownItem[] {
    const counts = new Map<string, number>();

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;
      if (o.mealType !== mealType) continue;

      const label = o.itemsLabel || "Unknown Item";
      const qty = o.mealQuantity || 1;
      counts.set(label, (counts.get(label) || 0) + qty);
    }

    return Array.from(counts.entries())
      .map(([itemName, count]) => ({ itemName, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Calculates progress for a given set of orders.
   * Progress % = (Ready + Out for Delivery + Delivered) / Total
   */
  static getProductionProgress(orders: Order[]): ProductionProgress {
    let total = 0;
    let scheduled = 0;
    let packing = 0;
    let packed = 0;
    let ready = 0;
    let cancelled = 0;
    let completed = 0;

    for (const o of orders) {
      const qty = o.mealQuantity || 1;
      if (o.status === "cancelled") {
        cancelled += qty;
      } else if (o.status !== "skipped") {
        total += qty;
        if (o.status === "scheduled") scheduled += qty;
        if (o.status === "packing") packing += qty;
        if (o.status === "packed") packed += qty;
        if (o.status === "ready_for_pickup") ready += qty;
        if (
          ["ready_for_pickup", "out_for_delivery", "delivered"].includes(
            o.status,
          )
        ) {
          completed += qty;
        }
      }
    }

    const completionPercentage =
      total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      scheduled,
      packing,
      packed,
      ready,
      cancelled,
      completionPercentage,
    };
  }

  /**
   * Groups packing requirements by Delivery Area.
   */
  static getAreaPacking(
    orders: Order[],
    zoneMap: Map<string, string>,
    customerMap: Map<string, string>,
  ): AreaPackingGroup[] {
    const areaMap = new Map<string, AreaPackingGroup>();

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;

      const areaId = o.zoneId;
      const areaName = areaId
        ? zoneMap.get(areaId) || areaId
        : "Unassigned Area";

      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          areaName,
          breakfast: 0,
          lunch: 0,
          dinner: 0,
          basic: 0,
          regular: 0,
          oneTime: 0,
          specialHandlingCount: 0,
          orders: [],
        });
      }

      const group = areaMap.get(areaName)!;

      const qty = o.mealQuantity || 1;

      if (o.mealType === "breakfast") group.breakfast += qty;
      else if (o.mealType === "lunch") group.lunch += qty;
      else if (o.mealType === "dinner") group.dinner += qty;

      if (o.source === "one_time") group.oneTime += qty;
      else if (o.planTier === "basic") group.basic += qty;
      else if (o.planTier === "regular") group.regular += qty;

      const hasSpecialHandling = Boolean(
        o.specialInstructions?.trim() || o.packingNotes?.trim(),
      );
      if (hasSpecialHandling) {
        group.specialHandlingCount += 1;
      }

      const displayId = formatAllottedId(
        o.customerCode || o.displayId,
        o.customerId,
        "customer",
      );

      const customerName =
        o.customerName ||
        (o.customerId ? customerMap.get(o.customerId) : undefined) ||
        displayId;

      group.orders.push({
        id: o.id,
        displayId,
        customerName,
        mealType: o.mealType,
        mealName: o.mealName || o.itemsLabel || o.mealType,
        quantity: o.mealQuantity || 1,
        specialInstructions: o.specialInstructions,
        packingNotes: o.packingNotes,
      });
    }

    // Sort groups by areaName, and sort orders within groups by mealType then customerName
    return Array.from(areaMap.values())
      .sort((a, b) => a.areaName.localeCompare(b.areaName))
      .map((group) => ({
        ...group,
        orders: group.orders.sort((a, b) => {
          const mealOrder: Record<string, number> = {
            breakfast: 1,
            lunch: 2,
            dinner: 3,
          };
          const aMeal = mealOrder[a.mealType] || 99;
          const bMeal = mealOrder[b.mealType] || 99;
          if (aMeal !== bMeal) return aMeal - bMeal;
          return a.customerName.localeCompare(b.customerName);
        }),
      }));
  }

  /**
   * Consolidated special-handling data helper.
   * Identifies orders with non-empty customer special instructions or menu packing notes.
   * Excludes cancelled and skipped orders.
   * Avoids duplicate entries when an order contains both kinds of notes.
   * Returns structured entries sorted by canonical meal type, area, and customer name.
   */
  static getSpecialHandlingOrders(
    orders: Order[],
    zoneMap?: Map<string, string>,
    customerMap?: Map<string, string>,
  ): SpecialHandlingOrderEntry[] {
    const entries: SpecialHandlingOrderEntry[] = [];

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;

      const specialInstructions = o.specialInstructions?.trim() || undefined;
      const packingNotes = o.packingNotes?.trim() || undefined;

      if (!specialInstructions && !packingNotes) continue;

      const areaId = o.zoneId;
      const areaName = areaId
        ? (zoneMap?.get(areaId) || areaId)
        : "Unassigned Area";

      const displayId = formatAllottedId(
        o.customerCode || o.displayId,
        o.customerId,
        "customer",
      );

      const customerName =
        o.customerName ||
        (o.customerId ? customerMap?.get(o.customerId) : undefined) ||
        displayId;

      const canonicalMealType = o.mealType
        ? String(o.mealType).trim().toLowerCase()
        : "";

      const mealName =
        o.itemsLabel || o.mealName || canonicalMealType || "Standard Meal";

      entries.push({
        id: o.id,
        displayId,
        customerName,
        mealType: canonicalMealType,
        mealName,
        quantity: o.mealQuantity || 1,
        area: areaName,
        zoneId: areaId,
        specialInstructions,
        packingNotes,
      });
    }

    const mealOrder: Record<string, number> = {
      breakfast: 1,
      lunch: 2,
      dinner: 3,
    };

    return entries.sort((a, b) => {
      const aMeal = mealOrder[a.mealType] || 99;
      const bMeal = mealOrder[b.mealType] || 99;
      if (aMeal !== bMeal) return aMeal - bMeal;

      const areaCompare = a.area.localeCompare(b.area);
      if (areaCompare !== 0) return areaCompare;

      return a.customerName.localeCompare(b.customerName);
    });
  }

  /**
   * Formats data specifically for the printable packing sheet.
   */
  static getPrintPackingSheet(
    orders: Order[],
    zoneMap: Map<string, string>,
    partnerMap: Map<string, string>,
    customerMap: Map<string, string>,
  ): PrintPackingRow[] {
    const rows: PrintPackingRow[] = [];

    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "skipped") continue;

      const areaId = o.zoneId;
      const areaName = areaId
        ? zoneMap.get(areaId) || areaId
        : "Unassigned Area";

      const partnerId = o.deliveryPartnerId;
      const deliveryPartner = partnerId
        ? partnerMap.get(partnerId) || partnerId
        : "Unassigned";

      const displayId = formatAllottedId(
        o.customerCode || o.displayId,
        o.customerId,
        "customer",
      );

      const customerName =
        o.customerName ||
        (o.customerId ? customerMap.get(o.customerId) : undefined) ||
        displayId;

      let plan = "One-Time";
      if (o.source === "subscription" && o.planTier) {
        plan = o.planTier.charAt(0).toUpperCase() + o.planTier.slice(1);
      }

      const canonicalMealType = o.mealType
        ? String(o.mealType).trim().toLowerCase()
        : "";
      const meal = o.itemsLabel || o.mealType || "";

      rows.push({
        orderId: o.id,
        displayId,
        area: areaName,
        customerName,
        mealType: canonicalMealType,
        meal,
        quantity: o.mealQuantity || 1,
        plan,
        deliveryPartner,
        specialInstructions: o.specialInstructions,
        packingNotes: o.packingNotes,
      });
    }

    // Sort by Area, then Customer Name
    return rows.sort((a, b) => {
      const areaCompare = a.area.localeCompare(b.area);
      if (areaCompare !== 0) return areaCompare;
      return a.customerName.localeCompare(b.customerName);
    });
  }
  /**
   * Advances an order to 'preparing'.
   */
  static async startPreparing(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error("Order ID is required.");
    const { orderRepository } = await import("../firestore/orderRepository");
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === "preparing") return; // Idempotency
    if (order.status !== "scheduled" && order.status !== "reopened") {
      throw new Error(`Cannot transition from ${order.status} to preparing.`);
    }

    await orderRepository.update(orderId, { status: "preparing" });

    await auditRepository.logAction(
      "production_preparing",
      adminId,
      "admin",
      "Admin",
      orderId,
      "order",
      { oldStatus: order.status, newStatus: "preparing" },
    );
  }

  /**
   * Advances an order to 'ready_for_pickup'.
   */
  static async markReady(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error("Order ID is required.");
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === "ready_for_pickup") return; // Idempotency
    if (order.status !== "preparing") {
      throw new Error(
        `Cannot transition from ${order.status} to ready_for_pickup.`,
      );
    }

    await orderRepository.update(orderId, { status: "ready_for_pickup" });

    await auditRepository.logAction(
      "production_ready",
      adminId,
      "admin",
      "Admin",
      orderId,
      "order",
      { oldStatus: order.status, newStatus: "ready_for_pickup" },
    );
  }

  /**
   * Locks production for an order.
   */
  static async lockProduction(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error("Order ID is required.");
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === "locked") return; // Idempotency
    if (order.status !== "ready_for_pickup") {
      throw new Error(`Cannot transition from ${order.status} to locked.`);
    }

    await orderRepository.update(orderId, { status: "locked" });

    await auditRepository.logAction(
      "production_locked",
      adminId,
      "admin",
      "Admin",
      orderId,
      "order",
      { oldStatus: order.status, newStatus: "locked" },
    );
  }

  /**
   * Closes production for an order (Day end).
   */
  static async closeProduction(
    orderId: string,
    adminId: string,
  ): Promise<void> {
    if (!orderId) throw new Error("Order ID is required.");
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === "closed") return; // Idempotency
    if (order.status !== "locked") {
      throw new Error(`Cannot transition from ${order.status} to closed.`);
    }

    await orderRepository.update(orderId, { status: "closed" });

    await auditRepository.logAction(
      "production_closed",
      adminId,
      "admin",
      "Admin",
      orderId,
      "order",
      { oldStatus: order.status, newStatus: "closed" },
    );
  }

  /**
   * Reopens a closed order.
   */
  static async reopenProduction(
    orderId: string,
    adminId: string,
  ): Promise<void> {
    if (!orderId) throw new Error("Order ID is required.");
    const { orderRepository } = await import("../firestore/orderRepository");
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === "reopened") return; // Idempotency
    if (order.status !== "closed" && order.status !== "locked") {
      throw new Error(`Cannot transition from ${order.status} to reopened.`);
    }

    await orderRepository.update(orderId, { status: "reopened" });

    const { auditRepository } = await import("../firestore/auditRepository");
    await auditRepository.logAction(
      "production_reopened",
      adminId,
      "admin",
      "Admin",
      orderId,
      "order",
      { oldStatus: order.status, newStatus: "reopened" },
    );
  }
}
