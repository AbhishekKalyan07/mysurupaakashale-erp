import { mealPlanRepository } from '../src/shared/services/firestore/mealPlanRepository';

import './automation/env'; // to load .env variables for firebase

async function seedPlans() {
  console.log('Seeding Meal Plans...');

  // Deactivate any existing plans first
  const existing = await mealPlanRepository.list();
  for (const plan of existing) {
    if (plan.isActive) {
      await mealPlanRepository.update(plan.id, { isActive: false });
      console.log(`Deactivated legacy plan: ${plan.id}`);
    }
  }

  // 1. Basic Plan
  await mealPlanRepository.create({
    tier: 'basic',
    name: 'Basic Plan',
    description: 'Including 3 times food with 3 times separate delivery.',
    pricePerDay: 159,
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: [
          {
            id: 'basic-breakfast-1',
            label: 'As Per Breakfast Menu',
            items: ['Breakfast Menu Item'],
          },
        ],
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          {
            id: 'basic-lunch-1',
            label: 'Rice & Sambar',
            items: ['Pickle', 'Rice', 'Sambar'],
          },
          {
            id: 'basic-lunch-2',
            label: 'Ragi Ball',
            items: ['1 Ragi Ball', 'Sambar', 'Buttermilk'],
          },
          {
            id: 'basic-lunch-3',
            label: 'Chapati & Sagu',
            items: ['3 Chapati', 'Sagu', 'Buttermilk'],
          },
        ],
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          {
            id: 'basic-dinner-1',
            label: 'Rice & Sambar',
            items: ['Rice', 'Sambar', 'Palya'],
          },
          {
            id: 'basic-dinner-2',
            label: 'Ragi Ball',
            items: ['1 Ragi Ball', 'Sambar', 'Palya'],
          },
          {
            id: 'basic-dinner-3',
            label: 'Chapati & Palya',
            items: ['3 Chapati', 'Palya'],
          },
        ],
      },
    ],
  });
  console.log('Created Basic Plan (159/day)');

  // 2. Regular Plan
  await mealPlanRepository.create({
    tier: 'regular',
    name: 'Regular Plan',
    description: 'Including 3 times food with 3 times separate delivery.',
    pricePerDay: 210,
    currency: 'INR',
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 2,
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: [
          {
            id: 'regular-breakfast-1',
            label: 'As Per Breakfast Menu',
            items: ['Breakfast Menu Item'],
          },
        ],
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          {
            id: 'regular-lunch-1',
            label: 'Ragi Ball Meal',
            items: ['Pickle', 'Rice', 'Sambar', '1 Ragi Ball', 'Buttermilk'],
          },
          {
            id: 'regular-lunch-2',
            label: 'Chapati Meal',
            items: ['Pickle', 'Rice', 'Sambar', '1 Chapati', 'Sagu/Palya', 'Buttermilk'],
          },
        ],
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          {
            id: 'regular-dinner-1',
            label: 'Chapati Meal',
            items: ['Rice', 'Sambar', '1 Chapati', 'Palya', 'Curd'],
          },
          {
            id: 'regular-dinner-2',
            label: 'Ragi Ball Meal',
            items: ['Rice', 'Sambar', '1 Ragi Ball', 'Curd'],
          },
        ],
      },
    ],
  });
  console.log('Created Regular Plan (210/day)');

  console.log('Done.');
  process.exit(0);
}

seedPlans().catch((err) => {
  console.error(err);
  process.exit(1);
});
