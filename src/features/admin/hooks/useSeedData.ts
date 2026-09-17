import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import toast from "react-hot-toast";

export function useSeedData() {
  const [isSeeding, setIsSeeding] = useState(false);

  const seedData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);

      // Seed 1: Subscription Plans (mealPlans)
      const plans = [
        {
          id: "monthly-standard",
          name: "Monthly Standard",
          description: "Basic daily meals",
          tier: "standard",
          meals: ["breakfast", "lunch", "dinner"],
          pricePerDay: 159,
          billingCycle: "monthly",
          isActive: true,
          sortOrder: 1,
          pricingMatrix: {
            breakfast: 60,
            lunch: 65,
            dinner: 65,
            breakfast_lunch: 115,
            lunch_dinner: 115,
            breakfast_dinner: 115,
            breakfast_lunch_dinner: 159,
          },
        },
        {
          id: "weekly-premium",
          name: "Weekly Premium",
          description: "Premium meals with extras",
          tier: "premium",
          meals: ["breakfast", "lunch", "dinner"],
          pricePerDay: 220,
          billingCycle: "weekly",
          isActive: true,
          sortOrder: 2,
          pricingMatrix: {
            breakfast: 80,
            lunch: 90,
            dinner: 90,
            breakfast_lunch: 160,
            lunch_dinner: 160,
            breakfast_dinner: 160,
            breakfast_lunch_dinner: 220,
          },
        },
      ];

      plans.forEach((plan) => {
        const ref = doc(db, "mealPlans", plan.id);
        batch.set(ref, {
          ...plan,
          createdAt:
            serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
          updatedAt:
            serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        });
      });

      // Seed 2: Business Settings
      const settingsRef = doc(db, "settings", "business");
      batch.set(settingsRef, {
        id: "business",
        companyProfile: {
          name: "Mysuru Paakashale",
          tagline: "Authentic Meals",
          supportEmail: "support@mysuru.com",
          supportPhone: "9880425089",
          address: "Mysuru",
        },
        financials: {
          gstPercentage: 5,
          currency: "INR",
          invoicePrefix: "INV",
        },
        pricing: {
          mealPrices: { breakfast: 50, lunch: 100, dinner: 100 },
          deliveryCharges: { standard: 30 },
          securityDepositAmount: 1000,
        },
        operations: {
          orderCutoffTime: "20:00",
          kitchenTimings: { start: "06:00", end: "22:00" },
          deliveryWindows: {
            breakfast: { start: "07:30", end: "09:00" },
            lunch: { start: "12:30", end: "14:00" },
            dinner: { start: "19:30", end: "21:00" },
          },
          cancellationCutoffTimes: {
            breakfast: "05:00",
            lunch: "10:30",
            dinner: "16:00",
          },
          businessHolidays: [],
        },
        payroll: {
          standardWorkingDays: 22,
          standardWorkingHours: 8,
          taxPercentage: 0,
          leaveDeductionMultiplier: 1,
        },
        updatedAt:
          serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });

      await batch.commit();
      toast.success("Successfully seeded initial production data!");
    } catch (err: unknown) {
      console.error("Error seeding data:", err);
      toast.error((err as Error).message || "Failed to seed data.");
    } finally {
      setIsSeeding(false);
    }
  };

  return { seedData, isSeeding };
}
