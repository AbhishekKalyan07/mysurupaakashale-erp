import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccountPath) });
}

const db = getFirestore();

async function seedPlans() {
  console.log('Seeding Meal Plans via Admin SDK...');

  const basicRef = db.collection('mealPlans').doc();
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
      breakfast_lunch_dinner: 159
    },
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    mealSlots: [
      { mealType: 'breakfast', isCustomerSelectable: false, options: [ { id: 'basic-breakfast-1', label: 'As Per Breakfast Menu', items: ['Breakfast Menu Item'] } ] },
      { mealType: 'lunch', isCustomerSelectable: true, options: [ { id: 'basic-lunch-1', label: 'Rice & Sambar', items: ['Pickle', 'Rice', 'Sambar'] }, { id: 'basic-lunch-2', label: 'Ragi Ball', items: ['1 Ragi Ball', 'Sambar', 'Buttermilk'] }, { id: 'basic-lunch-3', label: 'Chapati & Sagu', items: ['3 Chapati', 'Sagu', 'Buttermilk'] } ] },
      { mealType: 'dinner', isCustomerSelectable: true, options: [ { id: 'basic-dinner-1', label: 'Rice & Sambar', items: ['Rice', 'Sambar', 'Palya'] }, { id: 'basic-dinner-2', label: 'Ragi Ball', items: ['1 Ragi Ball', 'Sambar', 'Palya'] }, { id: 'basic-dinner-3', label: 'Chapati & Palya', items: ['3 Chapati', 'Palya'] } ] }
    ]
  });
  console.log('Created Basic Plan (159/day)');

  const regularRef = db.collection('mealPlans').doc();
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
      breakfast_lunch_dinner: 210
    },
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    mealSlots: [
      { mealType: 'breakfast', isCustomerSelectable: false, options: [ { id: 'regular-breakfast-1', label: 'As Per Breakfast Menu', items: ['Breakfast Menu Item'] } ] },
      { mealType: 'lunch', isCustomerSelectable: true, options: [ { id: 'regular-lunch-1', label: 'Ragi Ball Meal', items: ['Pickle', 'Rice', 'Sambar', '1 Ragi Ball', 'Buttermilk'] }, { id: 'regular-lunch-2', label: 'Chapati Meal', items: ['Pickle', 'Rice', 'Sambar', '1 Chapati', 'Sagu/Palya', 'Buttermilk'] } ] },
      { mealType: 'dinner', isCustomerSelectable: true, options: [ { id: 'regular-dinner-1', label: 'Chapati Meal', items: ['Rice', 'Sambar', '1 Chapati', 'Palya', 'Curd'] }, { id: 'regular-dinner-2', label: 'Ragi Ball Meal', items: ['Rice', 'Sambar', '1 Ragi Ball', 'Curd'] } ] }
    ]
  });
  console.log('Created Regular Plan (210/day)');

  console.log('Done.');
}

seedPlans().catch(console.error);
