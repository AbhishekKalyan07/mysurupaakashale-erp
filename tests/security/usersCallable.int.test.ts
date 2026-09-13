process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { initTestApp, cleanupTestApp, getFirestore, getAuth, type Firestore } from "../../functions/src/test-init";

vi.mock("firebase-functions/logger", () => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (handler: any) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

import { generateUserDisplayIdHandler } from "../../functions/src/users";

describe("Callable: generateUserDisplayId (Emulator Integration)", () => {
  let db: Firestore;

  beforeAll(() => {
    initTestApp();
    db = getFirestore();
  });

  afterAll(async () => {
    await cleanupTestApp();
  });

  async function ensureAuthUser(uid: string, displayName?: string) {
    const auth = getAuth();
    try {
      await auth.deleteUser(uid);
    } catch (e) {}
    const userParams: any = { uid };
    if (displayName !== undefined) {
      userParams.displayName = displayName;
    }
    await auth.createUser(userParams);
  }

  beforeEach(async () => {
    // Clear Firestore emulator using the test REST API
    const response = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-test/databases/(default)/documents", {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Failed to clear Firestore emulator");
    }
  });

  const callFn = (data: any, auth: any = { uid: "caller-uid" }) => {
    return generateUserDisplayIdHandler({ data, auth } as any);
  };

  it("unauthenticated callable -> DENY", async () => {
    await expect(callFn({ targetUserUid: "target", requestedRole: "customer" }, null))
      .rejects.toThrow("Authentication required");
  });

  it("CASE A: customer self-allocation -> succeeds", async () => {
    await ensureAuthUser("cust1", "Test User");
    const result = await callFn({ targetUserUid: "cust1", requestedRole: "customer" }, { uid: "cust1" });
    expect(result).toEqual({ displayId: "MP-T001" });

    // Verify counter
    const countSnap = await db.collection("settings").doc("userCounters").get();
    expect(countSnap.data()?.customer_T).toBe(1);

    // Verify allocation
    const allocSnap = await db.doc("idempotency/displayIds/allocations/cust1").get();
    expect(allocSnap.data()).toMatchObject({
      displayId: "MP-T001",
      role: "customer",
      targetUserUid: "cust1"
    });
  });

  it("customer fallback: missing displayName -> falls back to 'U' (MP-U001, customer_U)", async () => {
    await ensureAuthUser("cust_no_name"); // displayName not provided
    const result = await callFn({ targetUserUid: "cust_no_name", requestedRole: "customer" }, { uid: "cust_no_name" });
    expect(result).toEqual({ displayId: "MP-U001" });

    const countSnap = await db.collection("settings").doc("userCounters").get();
    expect(countSnap.data()?.customer_U).toBe(1);
  });

  it("customer fallback: blank displayName -> falls back to 'U' (MP-U001, customer_U)", async () => {
    await ensureAuthUser("cust_blank_name", "   "); // blank whitespace
    const result = await callFn({ targetUserUid: "cust_blank_name", requestedRole: "customer" }, { uid: "cust_blank_name" });
    expect(result).toEqual({ displayId: "MP-U001" });

    const countSnap = await db.collection("settings").doc("userCounters").get();
    expect(countSnap.data()?.customer_U).toBe(1);
  });

  it("customer fallback: invalid first character -> falls back to 'U' (MP-U001, customer_U)", async () => {
    await ensureAuthUser("cust_num_name", "123Alex"); // non-alphabet initial
    const result = await callFn({ targetUserUid: "cust_num_name", requestedRole: "customer" }, { uid: "cust_num_name" });
    expect(result).toEqual({ displayId: "MP-U001" });

    const countSnap = await db.collection("settings").doc("userCounters").get();
    expect(countSnap.data()?.customer_U).toBe(1);
  });

  it("customer normalization: lowercase first character -> uppercase (MP-A001, customer_A)", async () => {
    await ensureAuthUser("cust_lower_name", "alice"); // lowercase initial
    const result = await callFn({ targetUserUid: "cust_lower_name", requestedRole: "customer" }, { uid: "cust_lower_name" });
    expect(result).toEqual({ displayId: "MP-A001" });

    const countSnap = await db.collection("settings").doc("userCounters").get();
    expect(countSnap.data()?.customer_A).toBe(1);
  });

  it("customer cannot target another UID -> DENY", async () => {
    await ensureAuthUser("other1", "Other");
    await expect(callFn({ targetUserUid: "other1", requestedRole: "customer" }, { uid: "cust1" }))
      .rejects.toThrow("Cannot allocate a customer ID for a different UID.");
  });

  it("customer cannot request staff role -> DENY", async () => {
    await ensureAuthUser("cust1", "Cust");
    await expect(callFn({ targetUserUid: "cust1", requestedRole: "admin" }, { uid: "cust1" }))
      .rejects.toThrow("Admin cannot allocate a staff ID for themselves");
  });

  it("admin allocation for target UID -> succeeds", async () => {
    await ensureAuthUser("ktch1", "Kitchen");
    await db.doc("users/admin1").set({ role: "admin" });
    const result = await callFn({ targetUserUid: "ktch1", requestedRole: "kitchen" }, { uid: "admin1" });
    expect(result).toEqual({ displayId: "KTCH-1001" });
  });

  it("admin multiple different target UIDs -> scales counter correctly", async () => {
    await ensureAuthUser("ktch1", "Kitchen 1");
    await ensureAuthUser("ktch2", "Kitchen 2");
    await db.doc("users/admin1").set({ role: "admin" });
    const res1 = await callFn({ targetUserUid: "ktch1", requestedRole: "kitchen" }, { uid: "admin1" });
    const res2 = await callFn({ targetUserUid: "ktch2", requestedRole: "kitchen" }, { uid: "admin1" });
    
    expect(res1).toEqual({ displayId: "KTCH-1001" });
    expect(res2).toEqual({ displayId: "KTCH-1002" });

    const countSnap = await db.doc("settings/userCounters").get();
    expect(countSnap.data()?.kitchen).toBe(1002);
  });

  it("CASE B: same target retry/idempotency -> same ID", async () => {
    await ensureAuthUser("ktch1");
    await db.doc("users/admin1").set({ role: "admin" });
    const res1 = await callFn({ targetUserUid: "ktch1", requestedRole: "kitchen" }, { uid: "admin1" });
    const res2 = await callFn({ targetUserUid: "ktch1", requestedRole: "kitchen" }, { uid: "admin1" });
    
    expect(res1).toEqual({ displayId: "KTCH-1001" });
    expect(res2).toEqual({ displayId: "KTCH-1001" });

    const countSnap = await db.doc("settings/userCounters").get();
    expect(countSnap.data()?.kitchen).toBe(1001); // Counter did not increment
  });

  it("CASE F: conflicting existing allocation role -> reject", async () => {
    await ensureAuthUser("user1");
    await db.doc("users/admin1").set({ role: "admin" });
    await callFn({ targetUserUid: "user1", requestedRole: "kitchen" }, { uid: "admin1" });
    
    await expect(callFn({ targetUserUid: "user1", requestedRole: "delivery_partner" }, { uid: "admin1" }))
      .rejects.toThrow("conflicting role");
  });

  it("CASE D: existing user has displayId AND allocation -> verify they agree", async () => {
    await ensureAuthUser("user1");
    await db.doc("users/admin1").set({ role: "admin" });
    
    // Existing profile
    await db.doc("users/user1").set({ displayId: "KTCH-1001" });
    // Existing allocation
    await db.doc("idempotency/displayIds/allocations/user1").set({ displayId: "KTCH-1001", role: "kitchen", targetUserUid: "user1", allocatedByUid: "admin1" });

    const res = await callFn({ targetUserUid: "user1", requestedRole: "kitchen" }, { uid: "admin1" });
    expect(res).toEqual({ displayId: "KTCH-1001" });
  });

  it("CASE E: existing user has displayId conflicting with allocation -> reject", async () => {
    await ensureAuthUser("user1");
    await db.doc("users/admin1").set({ role: "admin" });
    
    await db.doc("users/user1").set({ displayId: "KTCH-9999" }); // conflicting
    await db.doc("idempotency/displayIds/allocations/user1").set({ displayId: "KTCH-1001", role: "kitchen", targetUserUid: "user1", allocatedByUid: "admin1" });

    await expect(callFn({ targetUserUid: "user1", requestedRole: "kitchen" }, { uid: "admin1" }))
      .rejects.toThrow("conflicts with allocation");
  });

  it("CASE C: existing profile displayId reconciliation (safe format)", async () => {
    await ensureAuthUser("ktch_legacy");
    await db.doc("users/admin1").set({ role: "admin" });
    
    // User profile already has displayId but NO allocation (legacy data)
    await db.doc("users/ktch_legacy").set({ displayId: "KTCH-150" });

    const res = await callFn({ targetUserUid: "ktch_legacy", requestedRole: "kitchen" }, { uid: "admin1" });
    expect(res).toEqual({ displayId: "KTCH-150" }); // Should return legacy ID

    // Counter must NOT have been incremented (no kitchen field in counters since it was never 1000)
    const countSnap = await db.doc("settings/userCounters").get();
    expect(countSnap.exists).toBe(false); // Or at least kitchen field is undefined

    // Allocation should be created mapping to legacy ID
    const allocSnap = await db.doc("idempotency/displayIds/allocations/ktch_legacy").get();
    expect(allocSnap.data()?.displayId).toBe("KTCH-150");
  });

  it("CASE C: existing profile displayId reconciliation (unsafe format) -> reject", async () => {
    await ensureAuthUser("invalid_legacy");
    await db.doc("users/admin1").set({ role: "admin" });
    await db.doc("users/invalid_legacy").set({ displayId: "RANDOM-ID" });

    await expect(callFn({ targetUserUid: "invalid_legacy", requestedRole: "kitchen" }, { uid: "admin1" }))
      .rejects.toThrow("cannot be safely mapped");
  });

  it("invalid counter value -> DENY", async () => {
    await ensureAuthUser("cust1", "Test User");
    await db.doc("settings/userCounters").set({ customer_T: "invalid" });

    await expect(callFn({ targetUserUid: "cust1", requestedRole: "customer" }, { uid: "cust1" }))
      .rejects.toThrow("Invalid counter value in database");
  });

  it("counter preservation", async () => {
    await ensureAuthUser("cust1", "Test User");
    await db.doc("settings/userCounters").set({ customer_T: 5, something_else: 100 });
    
    await callFn({ targetUserUid: "cust1", requestedRole: "customer" }, { uid: "cust1" });
    
    const countSnap = await db.doc("settings/userCounters").get();
    expect(countSnap.data()).toEqual({ customer_T: 6, something_else: 100 }); // merge true
  });
});
