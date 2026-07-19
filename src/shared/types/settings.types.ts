import type { Timestamp } from 'firebase/firestore';

export interface BusinessSettings {
  id: 'business'; // Singleton document
  companyProfile: {
    name: string;
    tagline: string;
    supportEmail: string;
    supportPhone: string;
    address: string;
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
    businessHolidays: string[]; // YYYY-MM-DD
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
