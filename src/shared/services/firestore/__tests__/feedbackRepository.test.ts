import { describe, it, expect, vi, beforeEach } from "vitest";
import { feedbackRepository } from "../feedbackRepository";
import { getDocs, onSnapshot, where } from "firebase/firestore";
import type { Feedback } from "@/shared/types/feedback.types";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => {
  class MockTimestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds = 0, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
  }

  return {
    Timestamp: MockTimestamp,
    initializeFirestore: vi.fn(() => ({})),
    getFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentSingleTabManager: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(),
    collection: vi.fn(() => ({ withConverter: vi.fn(() => "colRef") })),
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(),
    query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
    where: vi.fn((field, op, value) => ({ type: "where", field, op, value })),
    orderBy: vi.fn((field, dir) => ({ type: "orderBy", field, dir })),
    limit: vi.fn((limit) => ({ type: "limit", limit })),
  };
});

describe("feedbackRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getByCustomerId", () => {
    it("queries Firestore strictly by customerId equality and returns items ordered newest first", async () => {
      const olderFeedback: Feedback = {
        id: "fb-1",
        customerId: "cust-123",
        category: "food_quality",
        message: "First ticket message",
        status: "new",
        createdAt: { toDate: () => new Date("2026-09-01T10:00:00Z") } as any,
        updatedAt: { toDate: () => new Date("2026-09-01T10:00:00Z") } as any,
      };

      const newerFeedback: Feedback = {
        id: "fb-2",
        customerId: "cust-123",
        category: "delivery_issue",
        message: "Second ticket message",
        status: "resolved",
        resolutionNotes: "Issue resolved with driver.",
        createdAt: { toDate: () => new Date("2026-09-05T10:00:00Z") } as any,
        updatedAt: { toDate: () => new Date("2026-09-06T12:00:00Z") } as any,
      };

      // Mock returns in unordered / reverse chronological order
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => olderFeedback },
          { data: () => newerFeedback },
        ],
      } as any);

      const results = await feedbackRepository.getByCustomerId("cust-123");

      expect(where).toHaveBeenCalledWith("customerId", "==", "cust-123");
      expect(results).toHaveLength(2);
      // Newest should be first
      expect(results[0].id).toBe("fb-2");
      expect(results[1].id).toBe("fb-1");
    });

    it("returns empty array when customer has no submitted feedback", async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [],
      } as any);

      const results = await feedbackRepository.getByCustomerId("cust-empty");
      expect(where).toHaveBeenCalledWith("customerId", "==", "cust-empty");
      expect(results).toEqual([]);
    });
  });

  describe("subscribeToCustomerFeedback", () => {
    it("subscribes with customerId constraint and sorts notifications descending by createdAt", () => {
      const onNext = vi.fn();
      const onError = vi.fn();

      feedbackRepository.subscribeToCustomerFeedback("cust-123", onNext, onError);

      expect(where).toHaveBeenCalledWith("customerId", "==", "cust-123");
      expect(onSnapshot).toHaveBeenCalled();

      // Trigger the snapshot callback
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;

      const ticketA = {
        id: "fb-a",
        customerId: "cust-123",
        createdAt: { toDate: () => new Date("2026-09-01T08:00:00Z") },
      };
      const ticketB = {
        id: "fb-b",
        customerId: "cust-123",
        createdAt: { toDate: () => new Date("2026-09-02T08:00:00Z") },
      };

      callback({
        docs: [
          { data: () => ticketA },
          { data: () => ticketB },
        ],
      });

      expect(onNext).toHaveBeenCalledWith([ticketB, ticketA]);
    });
  });
});
