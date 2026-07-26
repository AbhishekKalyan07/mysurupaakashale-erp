import { Timestamp } from 'firebase/firestore';
export type FeedbackCategory = 'food_quality' | 'delivery_issue' | 'packaging' | 'other';
export type FeedbackStatus = 'new' | 'investigating' | 'resolved';

export interface Feedback {
  id: string;
  customerId: string;
  orderId?: string; // Optional if it's a general complaint
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  resolutionNotes?: string;
  createdAt: Timestamp; // Timestamp
  updatedAt: Timestamp; // Timestamp
}
