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
          id: "basic-plan",
          name: "Basic Plan",
          description: "Wholesome daily meals with 3 separate deliveries.",
          tier: "basic",
          pricePerDay: 159,
          deliveryIncluded: true,
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
          mealSlots: [
            {
              mealType: "breakfast",
              isCustomerSelectable: false,
              options: [
                {
                  id: "basic-breakfast-1",
                  label: "As Per Breakfast Menu",
                  items: ["Breakfast Menu Item"],
                },
              ],
            },
            {
              mealType: "lunch",
              isCustomerSelectable: true,
              options: [
                {
                  id: "basic-lunch-1",
                  label: "Rice & Sambar",
                  items: ["Pickle", "Rice", "Sambar"],
                },
                {
                  id: "basic-lunch-2",
                  label: "Ragi Ball",
                  items: ["1 Ragi Ball", "Sambar", "Buttermilk"],
                },
                {
                  id: "basic-lunch-3",
                  label: "Chapati & Sagu",
                  items: ["3 Chapati", "Sagu", "Buttermilk"],
                },
              ],
            },
            {
              mealType: "dinner",
              isCustomerSelectable: true,
              options: [
                {
                  id: "basic-dinner-1",
                  label: "Rice & Sambar",
                  items: ["Rice", "Sambar", "Palya"],
                },
                {
                  id: "basic-dinner-2",
                  label: "Ragi Ball",
                  items: ["1 Ragi Ball", "Sambar", "Palya"],
                },
                {
                  id: "basic-dinner-3",
                  label: "Chapati & Palya",
                  items: ["3 Chapati", "Palya"],
                },
              ],
            },
          ],
        },
        {
          id: "regular-plan",
          name: "Regular Plan",
          description: "Wholesome daily meals with 3 separate deliveries.",
          tier: "regular",
          pricePerDay: 210,
          deliveryIncluded: true,
          isActive: true,
          sortOrder: 2,
          pricingMatrix: {
            breakfast: 60,
            lunch: 85,
            dinner: 85,
            breakfast_lunch: 140,
            lunch_dinner: 140,
            breakfast_dinner: 140,
            breakfast_lunch_dinner: 210,
          },
          mealSlots: [
            {
              mealType: "breakfast",
              isCustomerSelectable: false,
              options: [
                {
                  id: "regular-breakfast-1",
                  label: "As Per Breakfast Menu",
                  items: ["Breakfast Menu Item"],
                },
              ],
            },
            {
              mealType: "lunch",
              isCustomerSelectable: true,
              options: [
                {
                  id: "regular-lunch-1",
                  label: "Ragi Ball Meal",
                  items: [
                    "Pickle",
                    "Rice",
                    "Sambar",
                    "1 Ragi Ball",
                    "Buttermilk",
                  ],
                },
                {
                  id: "regular-lunch-2",
                  label: "Chapati Meal",
                  items: [
                    "Pickle",
                    "Rice",
                    "Sambar",
                    "1 Chapati",
                    "Sagu/Palya",
                    "Buttermilk",
                  ],
                },
              ],
            },
            {
              mealType: "dinner",
              isCustomerSelectable: true,
              options: [
                {
                  id: "regular-dinner-1",
                  label: "Chapati Meal",
                  items: ["Rice", "Sambar", "1 Chapati", "Palya", "Curd"],
                },
                {
                  id: "regular-dinner-2",
                  label: "Ragi Ball Meal",
                  items: ["Rice", "Sambar", "1 Ragi Ball", "Curd"],
                },
              ],
            },
          ],
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
