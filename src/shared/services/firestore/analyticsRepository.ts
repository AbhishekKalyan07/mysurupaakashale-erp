import { db } from '@/shared/lib/firebase';
import type { DailySummary, OrderGenerationRun } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';

class AnalyticsRepository extends BaseRepository<DailySummary> {
  constructor() {
    super(db, 'analytics', createConverter<DailySummary>());
  }
}

class OrderGenerationRunRepository extends BaseRepository<OrderGenerationRun> {
  constructor() {
    super(db, 'orderGenerationRuns', createConverter<OrderGenerationRun>());
  }
}

export const analyticsRepository = new AnalyticsRepository();
export const orderGenerationRunRepository = new OrderGenerationRunRepository();
