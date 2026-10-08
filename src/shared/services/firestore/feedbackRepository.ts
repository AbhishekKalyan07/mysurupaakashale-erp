import { db } from "@/shared/lib/firebase";
import { BaseRepository, createConverter } from "./BaseRepository";
import type { Feedback } from "@/shared/types/feedback.types";
import { where, type Unsubscribe } from "firebase/firestore";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";

class FeedbackRepository extends BaseRepository<Feedback> {
  constructor() {
    super(db, "feedback", createConverter<Feedback>());
  }

  /**
   * Retrieves all feedback submitted by a customer, ordered newest first.
   * Performs client-side sort on createdAt to avoid requiring composite indexes on Firestore.
   */
  async getByCustomerId(customerId: string): Promise<Feedback[]> {
    const list = await this.list(where("customerId", "==", customerId));
    return list.sort((a, b) => {
      const timeA = parseFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const timeB = parseFirestoreDate(b.createdAt)?.getTime() ?? 0;
      return timeB - timeA;
    });
  }

  /**
   * Real-time subscription to feedback submitted by a specific customer.
   */
  subscribeToCustomerFeedback(
    customerId: string,
    onNext: (feedback: Feedback[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribeToList(
      (items) => {
        const sorted = [...items].sort((a, b) => {
          const timeA = parseFirestoreDate(a.createdAt)?.getTime() ?? 0;
          const timeB = parseFirestoreDate(b.createdAt)?.getTime() ?? 0;
          return timeB - timeA;
        });
        onNext(sorted);
      },
      onError,
      where("customerId", "==", customerId),
    );
  }
}

export const feedbackRepository = new FeedbackRepository();
