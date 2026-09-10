import type { ID, ISODateString, Timestamp } from "./common.types";

export interface DailySummary {
  id: ID; // e.g. "summary_2024-03-21"
  date: ISODateString;

  // Sales
  totalRevenue: number;
  cashPayments: number;
  onlinePayments: number;
  pendingPayments: number;
  refundedPayments: number;

  // Customers
  activeCustomers: number;
  newCustomers: number;
  activeSubscriptions: number;

  // Kitchen Production
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;

  // Delivery
  totalDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;

  // Distributions (Pre-aggregated for scalability)
  planDistribution: Record<string, number>;
  deliveryByArea: Record<string, number>;
  methodDistribution: Record<string, number>;
  partnerCount: Record<string, number>;
  peakHourCount: Record<string, number>;

  // Status Totals
  verifiedRevenue: number;
  pendingRevenue: number;
  rejectedRevenue: number;
  completedOrders: number;
  pendingOrders: number;
  kitchenPreparedToday: number;
  kitchenPendingToday: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderGenerationRun {
  id: ID;
  date: ISODateString;
  mealType: "breakfast" | "lunch" | "dinner";
  startedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
  ordersGenerated: number;
  ordersSkipped: number;
  ordersCancelled: number;
  ordersFailed: number;
  notificationsFailed: number;
  status: "success" | "partial" | "failed" | "running";
  error?: string;
}
