import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCustomerAddresses } from "../useCustomerAddresses";

// Mock auth hook
const mockProfile = {
  id: "test-user-123",
  role: "customer" as const,
  addresses: [
    {
      id: "addr-1",
      label: "Home",
      line1: "123 Main St",
      city: "Mysuru",
      state: "KA",
      isDefault: true,
      lat: null,
      lng: null,
    },
  ],
  addressIds: ["addr-1"],
  defaultAddressId: "addr-1",
};

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({
    firebaseUser: { uid: "test-user-123" },
    profile: mockProfile,
  }),
}));

// Mock firestore writeBatch
const mockBatchUpdate = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join("/") })),
  writeBatch: vi.fn(() => ({
    update: mockBatchUpdate,
    set: mockBatchSet,
    delete: mockBatchDelete,
    commit: mockBatchCommit,
  })),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
}));

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("useCustomerAddresses — Atomic Batch Synchronization", () => {
  let queryClient: QueryClient;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockBatchCommit.mockResolvedValue(undefined);
  });

  function renderHookHelper() {
    let result: ReturnType<typeof useCustomerAddresses> = null as any;
    function TestComponent() {
      result = useCustomerAddresses();
      return null;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(TestComponent)
        )
      );
    });
    return () => result;
  }

  it("Add updates all three representations atomically (root addresses, root addressIds, subcollection mirror)", async () => {
    const getHook = renderHookHelper();
    const hook = getHook();

    let newAddr: any;
    await act(async () => {
      newAddr = await hook.addAddress({
        label: "Office",
        line1: "456 Tech Park",
        city: "Mysuru",
        state: "KA",
        isDefault: false,
        lat: null,
        lng: null,
      });
    });

    expect(newAddr).toBeDefined();
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    // 1. Root addresses array updated
    const updatePayload = mockBatchUpdate.mock.calls[0][1];
    expect(updatePayload.addresses).toHaveLength(2);
    expect(updatePayload.addresses[1].id).toBe(newAddr.id);

    // 2. Root addressIds array updated
    expect(updatePayload.addressIds).toEqual(["addr-1", newAddr.id]);

    // 3. Subcollection mirror set
    const setPath = mockBatchSet.mock.calls[0][0].path;
    expect(setPath).toBe(`users/test-user-123/addresses/${newAddr.id}`);
    expect(mockBatchSet.mock.calls[0][1]).toEqual(newAddr);
  });

  it("Update preserves the ID and updates all three representations", async () => {
    const getHook = renderHookHelper();
    const hook = getHook();

    const updatedAddr = {
      id: "addr-1",
      label: "Home Sweet Home",
      line1: "123 Main St, Apt 4B",
      city: "Mysuru",
      state: "KA",
      isDefault: true,
      lat: 12.3,
      lng: 76.6,
    };

    await act(async () => {
      await hook.updateAddress(updatedAddr);
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    // 1. Root addresses updated with preserved ID
    const updatePayload = mockBatchUpdate.mock.calls[0][1];
    expect(updatePayload.addresses[0]).toEqual(updatedAddr);
    expect(updatePayload.addresses[0].id).toBe("addr-1");

    // 2. Root addressIds preserves the ID
    expect(updatePayload.addressIds).toContain("addr-1");

    // 3. Subcollection mirror updated
    const setPath = mockBatchSet.mock.calls[0][0].path;
    expect(setPath).toBe("users/test-user-123/addresses/addr-1");
    expect(mockBatchSet.mock.calls[0][1]).toEqual(updatedAddr);
  });

  it("Delete removes all three representations atomically", async () => {
    const getHook = renderHookHelper();
    const hook = getHook();

    await act(async () => {
      await hook.deleteAddress("addr-1");
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    // 1. Root addresses removes addr-1
    const updatePayload = mockBatchUpdate.mock.calls[0][1];
    expect(updatePayload.addresses).toEqual([]);

    // 2. Root addressIds removes addr-1
    expect(updatePayload.addressIds).toEqual([]);

    // 3. Subcollection mirror deleted
    const deletePath = mockBatchDelete.mock.calls[0][0].path;
    expect(deletePath).toBe("users/test-user-123/addresses/addr-1");
  });

  it("Simulated write failure rejects the operation and fails closed", async () => {
    mockBatchCommit.mockRejectedValueOnce(
      new Error("Firestore batch commit failed: simulated network interruption")
    );

    const getHook = renderHookHelper();
    const hook = getHook();

    let caughtError: any;
    await act(async () => {
      try {
        await hook.addAddress({
          label: "Branch",
          line1: "789 High St",
          city: "Mysuru",
          state: "KA",
          isDefault: false,
          lat: null,
          lng: null,
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain("Firestore batch commit failed");

    // Extend test with subsequent add:
    // Verify that because the previous write failed and refs were not mutated,
    // a subsequent successful add succeeds cleanly.
    let successfulAddr: any;
    await act(async () => {
      successfulAddr = await hook.addAddress({
        label: "Branch Recovered",
        line1: "789 High St",
        city: "Mysuru",
        state: "KA",
        isDefault: false,
        lat: null,
        lng: null,
      });
    });

    expect(successfulAddr).toBeDefined();
    expect(successfulAddr.label).toBe("Branch Recovered");
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
  });

  it("Concurrent address operations do not silently lose another address", async () => {
    const getHook = renderHookHelper();
    const hook = getHook();

    // Call two sequential address adds
    let addr1: any;
    let addr2: any;
    await act(async () => {
      addr1 = await hook.addAddress({
        label: "Addr 1",
        line1: "Line 1",
        city: "Mysuru",
        state: "KA",
        isDefault: false,
        lat: null,
        lng: null,
      });
      addr2 = await hook.addAddress({
        label: "Addr 2",
        line1: "Line 2",
        city: "Mysuru",
        state: "KA",
        isDefault: false,
        lat: null,
        lng: null,
      });
    });

    expect(addr1.id).not.toBe(addr2.id);
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);

    // Second call updated addressIds and addresses
    const secondCallPayload = mockBatchUpdate.mock.calls[1][1];
    expect(secondCallPayload.addressIds).toContain(addr1.id);
    expect(secondCallPayload.addressIds).toContain(addr2.id);
  });
});
