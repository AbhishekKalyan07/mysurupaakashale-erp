import type { Timestamp } from "firebase/firestore";

export interface BusinessSettings {
  id: "business"; // Singleton document
  companyProfile: {
    name: string;
    tagline: string;
    supportEmail: string;
    supportPhone: string;
    address: string;
    upiId?: string;
  };
  financials: {
    gstPercentage: number;
    currency: string;
    invoicePrefix: string;
  };
  pricing: {
    mealPrices: {
      breakfast: number;
      lunch: number;
      dinner: number;
    };
    deliveryCharges: {
      standard: number;
    };
    securityDepositAmount: number;
  };
  operations: {
    orderCutoffTime: string; // HH:mm format, e.g., '20:00'
    kitchenTimings: {
      start: string;
      end: string;
    };
    deliveryWindows: {
      breakfast: { start: string; end: string };
      lunch: { start: string; end: string };
      dinner: { start: string; end: string };
    };
    /** Cancellation deadline for each meal type (HH:mm, 24h, IST) */
    cancellationCutoffTimes: {
      breakfast: string; // e.g. '05:00' – must cancel before 5 AM
      lunch: string; // e.g. '10:30' – must cancel before 10:30 AM
      dinner: string; // e.g. '16:00' – must cancel before 4 PM
    };
    businessHolidays: string[]; // YYYY-MM-DD
  };
  payroll: {
    standardWorkingDays: number;
    standardWorkingHours: number;
    taxPercentage: number;
    leaveDeductionMultiplier: number;
  };
  notifications: {
    email: {
      enabled: boolean;
      senderName: string;
      replyEmail: string;
    };
    whatsapp: {
      enabled: boolean;
    };
    inApp: {
      enabled: boolean;
    };
    retry: {
      enabled: boolean;
      maxRetries: number;
    };
  };
  updatedAt: Timestamp;
  updatedBy: string; // Admin UID
}

/**
 * Authoritative default company profile configuration.
 * Single source of truth for fallback and initial company branding/contact details.
 */
export const DEFAULT_COMPANY_PROFILE = {
  name: "Mysuru Paakashale",
  tagline: "Authentic South Indian Meals",
  supportEmail: "support@mysurupaakashale.in",
  supportPhone: "9880425089",
  address: "Gokulam 3rd Stage, Mysuru - 570002",
  upiId: "mysuru.paakashale@upi",
} as const;

/**
 * Authoritative default payroll parameters.
 */
export const DEFAULT_PAYROLL_CONFIG = {
  standardWorkingDays: 22,
  standardWorkingHours: 8,
  taxPercentage: 0,
  leaveDeductionMultiplier: 1,
  defaultOvertimeRate: 100,
} as const;

/**
 * Authoritative operational cutoff times enforced by server security rules.
 * Breakfast: 05:00 IST (23:30 UTC prev day)
 * Lunch: 10:30 IST (05:00 UTC)
 * Dinner: 16:00 IST (10:30 UTC)
 */
export const AUTHORITATIVE_OPERATIONAL_CUTOFFS = {
  breakfast: "05:00",
  lunch: "10:30",
  dinner: "16:00",
} as const;
