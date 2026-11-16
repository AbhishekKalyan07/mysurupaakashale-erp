import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderRepository, mapWorkflowHistoryDoc } from "../orderRepository";
import {
  getDocs,
  onSnapshot,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { auth } from "@/shared/lib/firebase";

describe("orderRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queries", () => {
    it("getByDate", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([{ id: "1" } as any]);
      const res = await orderRepository.getByDate("2026-08-01");
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });

    it("getByDateAndStatus", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([]);
      const res = await orderRepository.getByDateAndStatus(
        "2026-08-01",
        "scheduled",
      );
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(0);
    });

    it("subscribeToDayOrders", () => {
      const subscribeSpy = vi
        .spyOn(orderRepository, "subscribeToList")
        .mockReturnValueOnce(vi.fn());
      const onNext = vi.fn();
      orderRepository.subscribeToDayOrders("2026-08-01", undefined, onNext);
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("getByDateAndMealType", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([]);
      await orderRepository.getByDateAndMealType("2026-08-01", "lunch");
      expect(listSpy).toHaveBeenCalled();
    });

    it("getCustomerOrders", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([]);
      await orderRepository.getCustomerOrders("cust-1");
      expect(listSpy).toHaveBeenCalled();
    });

    it("subscribeToCustomerOrders", () => {
      const subscribeSpy = vi
        .spyOn(orderRepository, "subscribeToList")
        .mockReturnValueOnce(vi.fn());
      orderRepository.subscribeToCustomerOrders("cust-1", vi.fn());
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("getCustomerOrdersByDate", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([]);
      await orderRepository.getCustomerOrdersByDate("cust-1", "2026-08-01");
      expect(listSpy).toHaveBeenCalled();
    });

    it("subscribeToDayMealTypeOrders", () => {
      const subscribeSpy = vi
        .spyOn(orderRepository, "subscribeToList")
        .mockReturnValueOnce(vi.fn());
      orderRepository.subscribeToDayMealTypeOrders(
        "2026-08-01",
        "lunch",
        vi.fn(),
      );
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it("getBySubscriptionId", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([
          { id: "2", date: "2026-08-02" } as any,
          { id: "1", date: "2026-08-01" } as any,
        ]);
      const res = await orderRepository.getBySubscriptionId("sub-123");
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(2);
      expect(res[0].id).toBe("1"); // Sorted by date asc
      expect(res[1].id).toBe("2");
    });

    it("getCustomerOrdersInRange returns orders normally when index exists", async () => {
      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockResolvedValueOnce([{ id: "ord-1", date: "2026-08-01" } as any]);
      const res = await orderRepository.getCustomerOrdersInRange(
        "cust-1",
        "2026-08-01",
        "2026-08-10",
      );
      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(res).toHaveLength(1);
    });

    it("getCustomerOrdersInRange falls back to in-memory filter when index is missing", async () => {
      const indexError: any = new Error("The query requires an index");
      indexError.code = "failed-precondition";

      const listSpy = vi
        .spyOn(orderRepository, "list")
        .mockRejectedValueOnce(indexError)
        .mockResolvedValueOnce([
          { id: "ord-old", date: "2026-07-20" } as any,
          { id: "ord-in-range-2", date: "2026-08-05" } as any,
          { id: "ord-in-range-1", date: "2026-08-01" } as any,
          { id: "ord-future", date: "2026-09-01" } as any,
        ]);

      const res = await orderRepository.getCustomerOrdersInRange(
        "cust-1",
        "2026-08-01",
        "2026-08-10",
      );

      expect(listSpy).toHaveBeenCalledTimes(2);
      expect(res).toHaveLength(2);
      expect(res[0].id).toBe("ord-in-range-1");
      expect(res[1].id).toBe("ord-in-range-2");
    });
  });

  describe("batchCreate", () => {
    it("creates multiple orders in a batch", async () => {
      const mockSet = vi.fn();
      const mockCommit = vi.fn().mockResolvedValueOnce(undefined);
      vi.mocked(writeBatch).mockReturnValueOnce({
        set: mockSet,
        commit: mockCommit,
      } as any);

      await orderRepository.batchCreate([
        { date: "2026-08-01", mealType: "lunch" } as any,
        { date: "2026-08-01", mealType: "dinner" } as any,
      ]);

      expect(writeBatch).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledTimes(2);
      expect(mockCommit).toHaveBeenCalled();
    });
  });

  describe("Workflow History", () => {
    const mockTimestamp = { seconds: 1722510000, nanoseconds: 0 } as any;

    it("mapWorkflowHistoryDoc maps Firestore document fields to OrderWorkflowHistory", () => {
      const mockDoc = {
        id: "wf-doc-1",
        data: () => ({
          fromStatus: "scheduled",
          toStatus: "preparing",
          changedBy: "user-kitchen-1",
          changedAt: mockTimestamp,
          notes: "Kitchen started preparation",
        }),
      } as any;

      const result = mapWorkflowHistoryDoc(mockDoc);
      expect(result).toEqual({
        id: "wf-doc-1",
        previousStatus: "scheduled",
        newStatus: "preparing",
        changedBy: "user-kitchen-1",
        changedAt: mockTimestamp,
        notes: "Kitchen started preparation",
      });
    });

    it("mapWorkflowHistoryDoc normalizes null and omitted notes to undefined", () => {
      const mockDocNullNotes = {
        id: "wf-doc-2",
        data: () => ({
          fromStatus: "preparing",
          toStatus: "packing",
          changedBy: "user-kitchen-2",
          changedAt: mockTimestamp,
          notes: null,
        }),
      } as any;

      const resultNull = mapWorkflowHistoryDoc(mockDocNullNotes);
      expect(resultNull.notes).toBeUndefined();
      expect(resultNull).toEqual({
        id: "wf-doc-2",
        previousStatus: "preparing",
        newStatus: "packing",
        changedBy: "user-kitchen-2",
        changedAt: mockTimestamp,
      });

      const mockDocOmittedNotes = {
        id: "wf-doc-3",
        data: () => ({
          fromStatus: "packing",
          toStatus: "ready_for_pickup",
          changedBy: "user-kitchen-3",
          changedAt: mockTimestamp,
        }),
      } as any;

      const resultOmitted = mapWorkflowHistoryDoc(mockDocOmittedNotes);
      expect(resultOmitted.notes).toBeUndefined();
    });

    it("getWorkflowHistory returns mapped workflow history items", async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          {
            id: "wf-1",
            data: () => ({
              fromStatus: "scheduled",
              toStatus: "preparing",
              changedBy: "user-1",
              changedAt: mockTimestamp,
              notes: "First note",
            }),
          },
          {
            id: "wf-2",
            data: () => ({
              fromStatus: "preparing",
              toStatus: "packing",
              changedBy: "user-2",
              changedAt: mockTimestamp,
              notes: null,
            }),
          },
        ],
      } as any);

      const res = await orderRepository.getWorkflowHistory("ord-1");
      expect(getDocs).toHaveBeenCalled();
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({
        id: "wf-1",
        previousStatus: "scheduled",
        newStatus: "preparing",
        changedBy: "user-1",
        changedAt: mockTimestamp,
        notes: "First note",
      });
      expect(res[1]).toEqual({
        id: "wf-2",
        previousStatus: "preparing",
        newStatus: "packing",
        changedBy: "user-2",
        changedAt: mockTimestamp,
      });
      expect(res[1].notes).toBeUndefined();
    });

    it("subscribeWorkflowHistory streams mapped OrderWorkflowHistory entries with normalized notes", () => {
      vi.mocked(onSnapshot).mockImplementationOnce((_query, onNext: any) => {
        onNext({
          docs: [
            {
              id: "wf-sub-1",
              data: () => ({
                fromStatus: "out_for_delivery",
                toStatus: "delivered",
                changedBy: "driver-1",
                changedAt: mockTimestamp,
                notes: "Delivered to reception",
              }),
            },
            {
              id: "wf-sub-2",
              data: () => ({
                fromStatus: "ready_for_pickup",
                toStatus: "out_for_delivery",
                changedBy: "driver-1",
                changedAt: mockTimestamp,
                notes: null,
              }),
            },
          ],
        });
        return vi.fn();
      });

      const onNext = vi.fn();
      const onError = vi.fn();
      const unsubscribe = orderRepository.subscribeWorkflowHistory(
        "ord-1",
        onNext,
        onError,
      );

      expect(onSnapshot).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe("function");
      expect(onNext).toHaveBeenCalledWith([
        {
          id: "wf-sub-1",
          previousStatus: "out_for_delivery",
          newStatus: "delivered",
          changedBy: "driver-1",
          changedAt: mockTimestamp,
          notes: "Delivered to reception",
        },
        {
          id: "wf-sub-2",
          previousStatus: "ready_for_pickup",
          newStatus: "out_for_delivery",
          changedBy: "driver-1",
          changedAt: mockTimestamp,
        },
      ]);
      expect(onError).not.toHaveBeenCalled();
    });

    it("subscribeWorkflowHistory propagates errors to onError callback", () => {
      const mockError = new Error("Firestore permission denied");
      vi.mocked(onSnapshot).mockImplementationOnce((_query, _onNext: any, onError: any) => {
        onError(mockError);
        return vi.fn();
      });

      const onNext = vi.fn();
      const onError = vi.fn();
      orderRepository.subscribeWorkflowHistory("ord-1", onNext, onError);

      expect(onError).toHaveBeenCalledWith(mockError);
      expect(onNext).not.toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow and records history with notes and current user", async () => {
      // Mock auth.currentUser
      (auth as any).currentUser = { uid: "test-user-123" };
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ status: "pending" }),
            })),
            set: vi.fn(),
            update: vi.fn(),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow(
        "ord-1",
        "preparing",
        "System confirmed",
      );
      expect(runTransaction).toHaveBeenCalled();
    });

    it("updates workflow with no notes and unknown user fallback", async () => {
      // Mock auth.currentUser to be undefined
      (auth as any).currentUser = undefined;
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ status: "pending" }),
            })),
            set: vi.fn(),
            update: vi.fn(),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow("ord-1", "preparing"); // notes undefined
      expect(runTransaction).toHaveBeenCalled();
    });

    it("throws if order not found", async () => {
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => false,
            })),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await expect(
        orderRepository.updateWorkflow("ord-1", "preparing"),
      ).rejects.toThrow("Order not found");
    });

    it("synchronizes kitchenStatus to ready_for_pickup when advancing to a delivery status", async () => {
      let capturedUpdate: any;
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ status: "scheduled" }),
            })),
            set: vi.fn(),
            update: vi.fn((_ref, payload) => {
              capturedUpdate = payload;
            }),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow("ord-1", "picked_up");
      expect(capturedUpdate).toBeDefined();
      expect(capturedUpdate.status).toBe("picked_up");
      expect(capturedUpdate.kitchenStatus).toBe("ready_for_pickup");
    });

    it("synchronizes kitchenStatus when advancing to a kitchen status", async () => {
      let capturedUpdate: any;
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ status: "scheduled" }),
            })),
            set: vi.fn(),
            update: vi.fn((_ref, payload) => {
              capturedUpdate = payload;
            }),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow("ord-1", "packing");
      expect(capturedUpdate).toBeDefined();
      expect(capturedUpdate.status).toBe("packing");
      expect(capturedUpdate.kitchenStatus).toBe("packing");
    });

    it("sets SLA timestamps when advancing to delivery statuses", async () => {
      let capturedUpdate: any;
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ status: "picked_up" }),
            })),
            set: vi.fn(),
            update: vi.fn((_ref, payload) => {
              capturedUpdate = payload;
            }),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow("ord-1", "out_for_delivery");
      expect(capturedUpdate.outForDeliveryAt).toBeDefined();
      expect(capturedUpdate.deliveredAt).toBeUndefined();
    });

    it("preserves existing SLA timestamps if already present", async () => {
      let capturedUpdate: any;
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({
                status: "out_for_delivery",
                outForDeliveryAt: "EXISTING_TIMESTAMP",
              }),
            })),
            set: vi.fn(),
            update: vi.fn((_ref, payload) => {
              capturedUpdate = payload;
            }),
          } as any;
          return await updateFunction(transaction);
        },
      );

      await orderRepository.updateWorkflow("ord-1", "out_for_delivery");
      expect(capturedUpdate.outForDeliveryAt).toBeUndefined(); // Should not overwrite
    });
  });
});
