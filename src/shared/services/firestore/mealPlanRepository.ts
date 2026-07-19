import { db } from '@/shared/lib/firebase';
import type { MealPlan } from '@/shared/types/mealPlan.types';
import { BaseRepository, createConverter } from './BaseRepository';

class MealPlanRepository extends BaseRepository<MealPlan> {
  constructor() {
    super(db, 'mealPlans', createConverter<MealPlan>());
  }
}

export const mealPlanRepository = new MealPlanRepository();
