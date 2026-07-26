import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { Feedback } from '@/shared/types/feedback.types';

class FeedbackRepository extends BaseRepository<Feedback> {
  constructor() {
    super(db, 'feedback', createConverter<Feedback>());
  }
}

export const feedbackRepository = new FeedbackRepository();
