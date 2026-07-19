import { useState } from 'react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import toast from 'react-hot-toast';

export function useSeedData() {
  const [isSeeding, setIsSeeding] = useState(false);

  const seedData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);

      // Seed 1: Subscription Plans (mealPlans)
      const plans = [
        {
          id: 'monthly-standard',
          name: 'Monthly Standard',
          description: 'Basic daily meals',
          pricePerDay: 150,
          billingCycle: 'monthly',
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'weekly-premium',
          name: 'Weekly Premium',
          description: 'Premium meals with extras',
          pricePerDay: 250,
          billingCycle: 'weekly',
          isActive: true,
          sortOrder: 2,
        },
      ];

      plans.forEach(plan => {
        const ref = doc(db, 'mealPlans', plan.id);
        batch.set(ref, {
          ...plan,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // Seed 2: Business Settings
      const settingsRef = doc(db, 'settings', 'business');
      batch.set(settingsRef, {
        id: 'business',
        companyProfile: {
          name: 'Mysuru Paakashale',
          tagline: 'Authentic Meals',
          supportEmail: 'support@mysuru.com',
          supportPhone: '9880425089',
          address: 'Mysuru',
        },
        financials: {
          gstPercentage: 5,
          currency: 'INR',
          invoicePrefix: 'INV',
        },
        pricing: {
          mealPrices: { breakfast: 50, lunch: 100, dinner: 100 },
          deliveryCharges: { standard: 30 },
        },
        operations: {
          orderCutoffTime: '20:00',
          kitchenTimings: { start: '06:00', end: '22:00' },
          deliveryWindows: {
            breakfast: { start: '07:30', end: '09:00' },
            lunch: { start: '12:30', end: '14:00' },
            dinner: { start: '19:30', end: '21:00' },
          },
          businessHolidays: [],
        },
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      toast.success('Successfully seeded initial production data!');
    } catch (err: any) {
      console.error('Error seeding data:', err);
      toast.error(err.message || 'Failed to seed data.');
    } finally {
      setIsSeeding(false);
    }
  };

  return { seedData, isSeeding };
}
