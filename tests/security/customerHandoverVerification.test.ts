import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { resolveOperationalZoneAndKitchen } from "@/shared/services/business/operationalRouter";

// Production delivery zones fixture
const PRODUCTION_DELIVERY_ZONES = [
  {
    id: "EylRuL1ck1Yi1nlfc5HQ",
    name: "VGM",
    city: "Mysuru",
    pincodes: ["570002"],
    kitchenId: "KITCHEN_CENTRAL",
    isActive: true,
  },
  {
    id: "GC1q64WG8UQ3hSozw2kN",
    name: "VINAY NEW",
    city: "Mysuru",
    pincodes: ["570011"],
    kitchenId: "KITCHEN_CENTRAL",
    isActive: true,
  },
  {
    id: "IE8rb91hobsxHlunSmvN",
    name: "ABHI",
    city: "Mysuru",
    pincodes: ["570023"],
    kitchenId: "KITCHEN_CENTRAL",
    isActive: true,
  },
  {
    id: "Uk33vtOItDl6pO0XJ1EP",
    name: "NEW BOY",
    city: "Mysuru",
    pincodes: ["570016"],
    kitchenId: "KITCHEN_CENTRAL",
    isActive: true,
  },
  {
    id: "ao0Q4gVKxaeRzMSF4l9p",
    name: "A&U",
    city: "Mysuru",
    pincodes: ["570033"],
    kitchenId: "KITCHEN_CENTRAL",
    isActive: true,
  },
];

/**
 * Finding 18: Customer ID Allocation Retry Classification Helpers
 *
 * Narrow retry policy:
 * - Retries 'aborted' (transient transaction contention)
 * - Retries 'failed-precondition' (concurrency / precondition failure)
 * - Immediately rethrows 'permission-denied' (authorization / security rules denial)
 * - Immediately rethrows all other Firestore error codes or generic errors
 */
export const isCustomerIdAllocationRetryable = (err: any): boolean => {
  const code = err?.code || "";
  return code === "aborted" || code === "failed-precondition";
};

export const executeCustomerIdAllocationWithRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries = 5,
  baseBackoffMs = 50,
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      if (isCustomerIdAllocationRetryable(err) && attempt < maxRetries) {
        if (baseBackoffMs > 0) {
          await new Promise((r) =>
            setTimeout(r, attempt * baseBackoffMs + Math.random() * baseBackoffMs),
          );
        }
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed after max retries");
};

describe("Client Handover Verification: Customer IDs & Operational Routing", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mysuru-paakashale",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8085,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });
  it("1. First 3 customers receive exactly MP-001, MP-002, MP-003 starting from production counter state", async () => {
    // Seed settings/userCounters with production state (customer field is UNSET)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        kitchen: 1002,
        delivery_partner: 1007,
        customer_A: 10,
        customer_M: 3,
        customer_P: 1,
      });
    });

    // NOTE: This helper copies production logic from userRepository.generateNextDisplayId('customer')
    // and must be kept in sync with userRepository.ts. It cannot call userRepository directly because
    // rules-unit-testing requires executing transactions against the test persona's authenticated
    // context (testEnv.authenticatedContext(callerUid).firestore()) to verify security rule authorization.
    const allocateCustomerId = async (callerUid: string): Promise<string> => {
      const client = testEnv.authenticatedContext(callerUid, { role: "customer" });
      const db = client.firestore();
      const counterRef = doc(db, "settings", "userCounters");

      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 0;
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          if (
            "customer" in data &&
            typeof data["customer"] === "number" &&
            Number.isInteger(data["customer"]) &&
            data["customer"] >= 0
          ) {
            count = data["customer"];
          }
        }
        const newCount = count + 1;
        transaction.set(counterRef, { customer: newCount }, { merge: true });
        const paddedCount = newCount.toString().padStart(3, "0");
        return `MP-${paddedCount}`;
      });
    };

    // 1st customer signs up
    const id1 = await allocateCustomerId("fake-user-1");
    expect(id1).toBe("MP-001");

    // Persist 1st customer profile and phone registry
    const client1 = testEnv.authenticatedContext("fake-user-1", { role: "customer" });
    const batch1 = writeBatch(client1.firestore());
    batch1.set(doc(client1.firestore(), "users", "fake-user-1"), {
      id: "fake-user-1",
      displayId: id1,
      role: "customer",
      fullName: "Client Customer One",
      phone: "+919880000001",
      isActive: true,
    });
    batch1.set(doc(client1.firestore(), "userPhones", "+919880000001"), {
      uid: "fake-user-1",
    });
    await batch1.commit();

    // 2nd customer signs up
    const id2 = await allocateCustomerId("fake-user-2");
    expect(id2).toBe("MP-002");

    // Persist 2nd customer profile and phone registry
    const client2 = testEnv.authenticatedContext("fake-user-2", { role: "customer" });
    const batch2 = writeBatch(client2.firestore());
    batch2.set(doc(client2.firestore(), "users", "fake-user-2"), {
      id: "fake-user-2",
      displayId: id2,
      role: "customer",
      fullName: "Client Customer Two",
      phone: "+919880000002",
      isActive: true,
    });
    batch2.set(doc(client2.firestore(), "userPhones", "+919880000002"), {
      uid: "fake-user-2",
    });
    await batch2.commit();

    // 3rd customer signs up
    const id3 = await allocateCustomerId("fake-user-3");
    expect(id3).toBe("MP-003");

    // Persist 3rd customer profile and phone registry
    const client3 = testEnv.authenticatedContext("fake-user-3", { role: "customer" });
    const batch3 = writeBatch(client3.firestore());
    batch3.set(doc(client3.firestore(), "users", "fake-user-3"), {
      id: "fake-user-3",
      displayId: id3,
      role: "customer",
      fullName: "Client Customer Three",
      phone: "+919880000003",
      isActive: true,
    });
    batch3.set(doc(client3.firestore(), "userPhones", "+919880000003"), {
      uid: "fake-user-3",
    });
    await batch3.commit();

    // Verify counter document state
    const counterSnap = await getDoc(doc(client3.firestore(), "settings", "userCounters"));
    const counterData = counterSnap.data();
    expect(counterData?.customer).toBe(3);
    // Crucial check: staff counters and legacy counters were NOT touched or altered
    expect(counterData?.kitchen).toBe(1002);
    expect(counterData?.delivery_partner).toBe(1007);
    expect(counterData?.customer_A).toBe(10);
    expect(counterData?.customer_M).toBe(3);
    expect(counterData?.customer_P).toBe(1);

    // Verify users documents
    const u1Snap = await getDoc(doc(client1.firestore(), "users", "fake-user-1"));
    expect(u1Snap.data()?.displayId).toBe("MP-001");
    const u2Snap = await getDoc(doc(client2.firestore(), "users", "fake-user-2"));
    expect(u2Snap.data()?.displayId).toBe("MP-002");
    const u3Snap = await getDoc(doc(client3.firestore(), "users", "fake-user-3"));
    expect(u3Snap.data()?.displayId).toBe("MP-003");

    // Verify phone registry was persisted
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const p1Snap = await getDoc(doc(db, "userPhones", "+919880000001"));
      expect(p1Snap.data()?.uid).toBe("fake-user-1");
      const p2Snap = await getDoc(doc(db, "userPhones", "+919880000002"));
      expect(p2Snap.data()?.uid).toBe("fake-user-2");
      const p3Snap = await getDoc(doc(db, "userPhones", "+919880000003"));
      expect(p3Snap.data()?.uid).toBe("fake-user-3");
    });
  });

  it("2. Staggered customer creation generates unique sequential IDs without duplicates", async () => {
    // Seed counter at 3
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer: 3,
        kitchen: 1002,
        delivery_partner: 1007,
      });
    });

    // NOTE: This helper copies production logic from userRepository.generateNextDisplayId('customer')
    // wrapped with retry logic, and must be kept in sync with userRepository.ts.
    const allocateCustomerIdWithRetry = async (callerUid: string): Promise<string> => {
      const client = testEnv.authenticatedContext(callerUid, { role: "customer" });
      const db = client.firestore();
      const counterRef = doc(db, "settings", "userCounters");

      return executeCustomerIdAllocationWithRetry(async () => {
        return await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let count = 0;
          if (counterDoc.exists()) {
            const data = counterDoc.data();
            if (
              "customer" in data &&
              typeof data["customer"] === "number" &&
              Number.isInteger(data["customer"]) &&
              data["customer"] >= 0
            ) {
              count = data["customer"];
            }
          }
          const newCount = count + 1;
          transaction.set(counterRef, { customer: newCount }, { merge: true });
          const paddedCount = newCount.toString().padStart(3, "0");
          return `MP-${paddedCount}`;
        });
      }, 5, 50);
    };

    const allocateWithArrivalJitter = async (callerUid: string, delayMs: number): Promise<string> => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return allocateCustomerIdWithRetry(callerUid);
    };

    // Run 5 allocations with realistic concurrent arrival intervals in emulator
    const promises = [
      allocateWithArrivalJitter("concurrent-user-1", 0),
      allocateWithArrivalJitter("concurrent-user-2", 350),
      allocateWithArrivalJitter("concurrent-user-3", 700),
      allocateWithArrivalJitter("concurrent-user-4", 1050),
      allocateWithArrivalJitter("concurrent-user-5", 1400),
    ];

    const results = await Promise.all(promises);

    // Verify all 5 IDs are unique
    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(5);

    // Verify IDs are in the set MP-004 through MP-008
    const expectedSet = new Set(["MP-004", "MP-005", "MP-006", "MP-007", "MP-008"]);
    expect(uniqueIds).toEqual(expectedSet);

    // Verify counter ended at exactly 8
    const admin = testEnv.authenticatedContext("admin1", { role: "admin" });
    const finalSnap = await getDoc(doc(admin.firestore(), "settings", "userCounters"));
    expect(finalSnap.data()?.customer).toBe(8);
  });

  it("3. Staff ID generation is completely isolated from customer counter", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer: 5,
        kitchen: 1002,
        delivery_partner: 1007,
      });
      await setDoc(doc(context.firestore(), "users/admin1"), {
        role: "admin",
        isActive: true,
      });
    });

    // NOTE: This helper copies production logic from userRepository.generateNextDisplayId for staff roles
    // and must be kept in sync with userRepository.ts.
    const allocateStaffId = async (role: "kitchen" | "delivery_partner"): Promise<string> => {
      const admin = testEnv.authenticatedContext("admin1", { role: "admin" });
      const db = admin.firestore();
      const counterRef = doc(db, "settings", "userCounters");
      const prefix = role === "kitchen" ? "KTCH" : "DLVY";

      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 1000;
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          if (role in data && typeof data[role] === "number") {
            count = data[role];
          }
        }
        const newCount = count + 1;
        transaction.set(counterRef, { [role]: newCount }, { merge: true });
        return `${prefix}-${newCount}`;
      });
    };

    const ktchId = await allocateStaffId("kitchen");
    expect(ktchId).toBe("KTCH-1003");

    const dlvyId = await allocateStaffId("delivery_partner");
    expect(dlvyId).toBe("DLVY-1008");

    // Customer counter remains untouched at 5
    const admin = testEnv.authenticatedContext("admin1", { role: "admin" });
    const snap = await getDoc(doc(admin.firestore(), "settings", "userCounters"));
    expect(snap.data()?.customer).toBe(5);
    expect(snap.data()?.kitchen).toBe(1003);
    expect(snap.data()?.delivery_partner).toBe(1008);
  });

  it("4. Delivery zone routing resolves all 5 production delivery zones to KITCHEN_CENTRAL", () => {
    // Zone 1: VGM (570002)
    const r1 = resolveOperationalZoneAndKitchen({ pincode: "570002" }, PRODUCTION_DELIVERY_ZONES);
    expect(r1.zoneId).toBe("EylRuL1ck1Yi1nlfc5HQ");
    expect(r1.kitchenId).toBe("KITCHEN_CENTRAL");

    // Zone 2: VINAY NEW (570011)
    const r2 = resolveOperationalZoneAndKitchen({ pincode: "570011" }, PRODUCTION_DELIVERY_ZONES);
    expect(r2.zoneId).toBe("GC1q64WG8UQ3hSozw2kN");
    expect(r2.kitchenId).toBe("KITCHEN_CENTRAL");

    // Zone 3: ABHI (570023)
    const r3 = resolveOperationalZoneAndKitchen({ pincode: "570023" }, PRODUCTION_DELIVERY_ZONES);
    expect(r3.zoneId).toBe("IE8rb91hobsxHlunSmvN");
    expect(r3.kitchenId).toBe("KITCHEN_CENTRAL");

    // Zone 4: NEW BOY (570016)
    const r4 = resolveOperationalZoneAndKitchen({ pincode: "570016" }, PRODUCTION_DELIVERY_ZONES);
    expect(r4.zoneId).toBe("Uk33vtOItDl6pO0XJ1EP");
    expect(r4.kitchenId).toBe("KITCHEN_CENTRAL");

    // Zone 5: A&U (570033)
    const r5 = resolveOperationalZoneAndKitchen({ pincode: "570033" }, PRODUCTION_DELIVERY_ZONES);
    expect(r5.zoneId).toBe("ao0Q4gVKxaeRzMSF4l9p");
    expect(r5.kitchenId).toBe("KITCHEN_CENTRAL");
  });

  it("5. Delivery zone routing safely rejects uncovered, empty, and invalid pincodes", () => {
    // Uncovered pincode
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "570099" }, PRODUCTION_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No delivery zone serves pincode 570099.");

    // Blank pincode
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "" }, PRODUCTION_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No valid address or pincode provided.");

    // Null address
    expect(() =>
      resolveOperationalZoneAndKitchen(null, PRODUCTION_DELIVERY_ZONES)
    ).toThrow("Cannot route order: No valid address or pincode provided.");

    // Inactive zone is rejected
    const zonesWithInactive = PRODUCTION_DELIVERY_ZONES.map((z) =>
      z.id === "EylRuL1ck1Yi1nlfc5HQ" ? { ...z, isActive: false } : z
    );
    expect(() =>
      resolveOperationalZoneAndKitchen({ pincode: "570002" }, zonesWithInactive)
    ).toThrow("Cannot route order: No delivery zone serves pincode 570002.");
  });

  it("6. Phone registry uniqueness prevents duplicate customer phone registrations", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/existing-user-uid"), {
        id: "existing-user-uid",
        role: "customer",
        phone: "+919880000001",
        fullName: "Existing Customer",
      });
      await setDoc(doc(context.firestore(), "userPhones/+919880000001"), {
        uid: "existing-user-uid",
      });
    });

    const newCustomer = testEnv.authenticatedContext("new-user-uid", { role: "customer" });
    const phoneRef = doc(newCustomer.firestore(), "userPhones/+919880000001");

    // Attempting to overwrite existing phone number document fails with permission-denied
    await assertFails(setDoc(phoneRef, { uid: "new-user-uid" }));

    // Attempting to overwrite existing phone number document even when paired in a batch fails
    const duplicateBatch = writeBatch(newCustomer.firestore());
    duplicateBatch.set(doc(newCustomer.firestore(), "users/new-user-uid"), {
      id: "new-user-uid",
      role: "customer",
      phone: "+919880000001",
      fullName: "Duplicate Phone Customer",
    });
    duplicateBatch.set(phoneRef, { uid: "new-user-uid" });
    await assertFails(duplicateBatch.commit());

    // Positive control: registering an unused phone number paired with user creation succeeds
    const successBatch = writeBatch(newCustomer.firestore());
    successBatch.set(doc(newCustomer.firestore(), "users/new-user-uid"), {
      id: "new-user-uid",
      role: "customer",
      phone: "+919880000002",
      fullName: "New Unique Customer",
    });
    successBatch.set(doc(newCustomer.firestore(), "userPhones/+919880000002"), {
      uid: "new-user-uid",
    });
    await assertSucceeds(successBatch.commit());
  });
});

describe("Finding 18 — Customer ID Allocation Retry Classification", () => {
  it("18.1 retries 'aborted' errors until success", async () => {
    let attempts = 0;
    const result = await executeCustomerIdAllocationWithRetry(async () => {
      attempts++;
      if (attempts < 3) {
        const error: any = new Error("Transaction aborted due to contention");
        error.code = "aborted";
        throw error;
      }
      return "MP-001";
    }, 5, 1);
    expect(result).toBe("MP-001");
    expect(attempts).toBe(3);
  });

  it("18.2 retries 'failed-precondition' errors until success", async () => {
    let attempts = 0;
    const result = await executeCustomerIdAllocationWithRetry(async () => {
      attempts++;
      if (attempts < 3) {
        const error: any = new Error("Transaction failed precondition");
        error.code = "failed-precondition";
        throw error;
      }
      return "MP-002";
    }, 5, 1);
    expect(result).toBe("MP-002");
    expect(attempts).toBe(3);
  });

  it("18.3 immediately rethrows 'permission-denied' without retry", async () => {
    let attempts = 0;
    const permissionError: any = new Error("Permission denied by rules");
    permissionError.code = "permission-denied";

    await expect(
      executeCustomerIdAllocationWithRetry(async () => {
        attempts++;
        throw permissionError;
      }, 5, 1),
    ).rejects.toThrow("Permission denied by rules");

    expect(attempts).toBe(1);
  });

  it("18.4 immediately rethrows unrelated errors without retry", async () => {
    let unauthAttempts = 0;
    const unauthError: any = new Error("Unauthenticated caller");
    unauthError.code = "unauthenticated";

    await expect(
      executeCustomerIdAllocationWithRetry(async () => {
        unauthAttempts++;
        throw unauthError;
      }, 5, 1),
    ).rejects.toThrow("Unauthenticated caller");

    expect(unauthAttempts).toBe(1);

    let genericAttempts = 0;
    await expect(
      executeCustomerIdAllocationWithRetry(async () => {
        genericAttempts++;
        throw new Error("Generic unexpected error");
      }, 5, 1),
    ).rejects.toThrow("Generic unexpected error");

    expect(genericAttempts).toBe(1);
  });

  it("18.5 respects the retry limit when retryable error persists", async () => {
    let attempts = 0;
    const persistentAbort: any = new Error("Persistent abort error");
    persistentAbort.code = "aborted";

    await expect(
      executeCustomerIdAllocationWithRetry(async () => {
        attempts++;
        throw persistentAbort;
      }, 4, 1),
    ).rejects.toThrow("Persistent abort error");

    expect(attempts).toBe(4);
  });
});
