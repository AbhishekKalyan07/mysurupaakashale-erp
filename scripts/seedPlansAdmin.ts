// scripts/seedPlansAdmin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Seeds mealPlans via the Admin SDK.
// ONLY runs against the local Firebase Emulator (blocked by enforceEmulatorGuard).
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as dotenv from 'dotenv';

// 1. Load .env.local so VITE_FIREBASE_PROJECT_ID etc. are available to the guard
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// 2. Point at local emulators BEFORE the guard check
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// 3. Guard – blocks immediately if not targeting a safe emulator environment
import { enforceEmulatorGuard } from '../src/shared/lib/environmentGuard.node';
enforceEmulatorGuard();

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test',
  });
}

const db = getFirestore();

async function seedPlans() {
  console.log('Seeding Meal Plans via Admin SDK...');

  // Deactivate any existing legacy plans first
  const existingSnap = await db.collection('mealPlans').get();
  for (const doc of existingSnap.docs) {
    if (doc.id !== 'basic-plan' && doc.id !== 'regular-plan') {
      await doc.ref.update({ isActive: false });
      console.log(`Deactivated legacy plan: ${doc.id}`);
    }
  }

  const basicRef = db.collection('mealPlans').doc('basic-plan');
  await basicRef.set({
    tier: 'basic',
    name: 'Basic Plan',
    description: 'Including 3 times food with 3 times separate delivery.',
    pricePerDay: 159,
    pricingMatrix: {
      breakfast: 60,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 115,
      lunch_dinner: 115,
      breakfast_dinner: 115,
      breakfast_lunch_dinner: 159,
    },
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: [{ id: 'basic-breakfast-1', label: 'As Per Breakfast Menu', items: ['Breakfast Menu Item'] }],
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          { id: 'basic-lunch-1', label: 'Rice & Sambar', items: ['Pickle', 'Rice', 'Sambar'] },
          { id: 'basic-lunch-2', label: 'Ragi Ball', items: ['1 Ragi Ball', 'Sambar', 'Buttermilk'] },
          { id: 'basic-lunch-3', label: 'Chapati & Sagu', items: ['3 Chapati', 'Sagu', 'Buttermilk'] },
        ],
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          { id: 'basic-dinner-1', label: 'Rice & Sambar', items: ['Rice', 'Sambar', 'Palya'] },
          { id: 'basic-dinner-2', label: 'Ragi Ball', items: ['1 Ragi Ball', 'Sambar', 'Palya'] },
          { id: 'basic-dinner-3', label: 'Chapati & Palya', items: ['3 Chapati', 'Palya'] },
        ],
      },
    ],
  });
  console.log('Created Basic Plan (159/day)');

  const regularRef = db.collection('mealPlans').doc('regular-plan');
  await regularRef.set({
    tier: 'regular',
    name: 'Regular Plan',
    description: 'Including 3 times food with 3 times separate delivery.',
    pricePerDay: 210,
    pricingMatrix: {
      breakfast: 60,
      lunch: 85,
      dinner: 85,
      breakfast_lunch: 140,
      lunch_dinner: 140,
      breakfast_dinner: 140,
      breakfast_lunch_dinner: 210,
    },
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: [{ id: 'regular-breakfast-1', label: 'As Per Breakfast Menu', items: ['Breakfast Menu Item'] }],
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          { id: 'regular-lunch-1', label: 'Ragi Ball Meal', items: ['Pickle', 'Rice', 'Sambar', '1 Ragi Ball', 'Buttermilk'] },
          { id: 'regular-lunch-2', label: 'Chapati Meal', items: ['Pickle', 'Rice', 'Sambar', '1 Chapati', 'Sagu/Palya', 'Buttermilk'] },
        ],
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          { id: 'regular-dinner-1', label: 'Chapati Meal', items: ['Rice', 'Sambar', '1 Chapati', 'Palya', 'Curd'] },
          { id: 'regular-dinner-2', label: 'Ragi Ball Meal', items: ['Rice', 'Sambar', '1 Ragi Ball', 'Curd'] },
        ],
      },
    ],
  });
  console.log('Created Regular Plan (210/day)');

  console.log('Done.');
}

seedPlans().catch(console.error);
