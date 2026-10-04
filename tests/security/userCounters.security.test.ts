import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-mysuru-paakashale",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
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

const seedCounters = async (data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "settings/userCounters"), data);
  });
};

describe("Security Rules: settings/userCounters (continuous customer counter)", () => {
  it("1. unauthenticated read and write are denied", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const ref = doc(unauthed.firestore(), "settings/userCounters");

    await expect(getDoc(ref)).rejects.toThrow();
    await expect(setDoc(ref, { customer: 1 })).rejects.toThrow();
  });

  it("2. customer can read userCounters document", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const snap = await getDoc(doc(customer.firestore(), "settings/userCounters"));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.customer).toBe(5);
  });

  it("3. first customer initializes the continuous counter to 1", async () => {
    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(setDoc(ref, { customer: 1 })).resolves.not.toThrow();
  });

  it("4. customer cannot initialize the counter with a value other than 1", async () => {
    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(setDoc(ref, { customer: 2 })).rejects.toThrow();
    await expect(setDoc(ref, { customer: 0 })).rejects.toThrow();
    await expect(setDoc(ref, { customer: -1 })).rejects.toThrow();
  });

  it("5. existing counter increments by exactly 1", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(updateDoc(ref, { customer: 6 })).resolves.not.toThrow();
  });

  it("6. customer cannot increment by 2", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(updateDoc(ref, { customer: 7 })).rejects.toThrow();
  });

  it("7. customer cannot decrement or reset the counter", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(updateDoc(ref, { customer: 4 })).rejects.toThrow();
    await expect(updateDoc(ref, { customer: 1 })).rejects.toThrow();
  });

  it("8. customer cannot modify a staff counter", async () => {
    await seedCounters({ customer: 5, kitchen: 1001 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(updateDoc(ref, { kitchen: 1002 })).rejects.toThrow();
    await expect(
      setDoc(ref, { delivery_partner: 1001 }, { merge: true }),
    ).rejects.toThrow();
  });

  it("9. customer cannot modify multiple counters in one update", async () => {
    await seedCounters({ customer: 5, kitchen: 1001 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(
      updateDoc(ref, { customer: 6, kitchen: 1002 }),
    ).rejects.toThrow();
  });

  it("10. customer cannot add arbitrary fields", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(updateDoc(ref, { arbitraryField: 123 })).rejects.toThrow();
    await expect(
      setDoc(ref, { customer: 6, role: "admin" }, { merge: true }),
    ).rejects.toThrow();
  });

  it("11. customer cannot delete the counter document", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    await expect(
      deleteDoc(doc(customer.firestore(), "settings/userCounters")),
    ).rejects.toThrow();
  });

  it("12. admin can manage and update staff counters", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/admin1"), {
        role: "admin",
        isActive: true,
      });
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        kitchen: 1001,
      });
    });

    const admin = testEnv.authenticatedContext("admin1", { role: "admin" });
    const ref = doc(admin.firestore(), "settings/userCounters");

    await expect(
      updateDoc(ref, { kitchen: 1002, delivery_partner: 1001 }),
    ).resolves.not.toThrow();
  });

  it("13. idempotency collection remains denied to all client contexts", async () => {
    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "idempotency/displayIds/allocations/cust1");

    await expect(getDoc(ref)).rejects.toThrow();
    await expect(setDoc(ref, { displayId: "MP-001" })).rejects.toThrow();
  });

  it("14. legacy per-initial counters (customer_A etc.) are no longer client-writable", async () => {
    await seedCounters({ customer: 5 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const ref = doc(customer.firestore(), "settings/userCounters");

    await expect(
      setDoc(ref, { customer_A: 1 }, { merge: true }),
    ).rejects.toThrow();
    await expect(
      setDoc(ref, { customer_Z: 1 }, { merge: true }),
    ).rejects.toThrow();
  });

  it("15. real client runTransaction (same code path as generateNextDisplayId) allocates MP numbers", async () => {
    await seedCounters({ customer: 3 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    const allocate = () =>
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const next = (snap.exists() ? (snap.data().customer as number) : 0) + 1;
        tx.set(ref, { customer: next }, { merge: true });
        return `MP-${String(next).padStart(3, "0")}`;
      });

    expect(await allocate()).toBe("MP-004");
    expect(await allocate()).toBe("MP-005");
  });

  it("16. concurrent real transactions never return a duplicate Customer ID", async () => {
    await seedCounters({ customer: 0 });

    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    const allocate = async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const next = (snap.exists() ? (snap.data().customer as number) : 0) + 1;
            tx.set(ref, { customer: next }, { merge: true });
            return `MP-${String(next).padStart(3, "0")}`;
          });
        } catch (e) {
          if (attempt < 5) {
            await new Promise((r) => setTimeout(r, attempt * 60 + Math.random() * 40));
            continue;
          }
          throw e;
        }
      }
    };

    const ids = await Promise.all([allocate(), allocate(), allocate(), allocate(), allocate()]);

    expect(new Set(ids).size).toBe(5);
    expect([...ids].sort()).toEqual(["MP-001", "MP-002", "MP-003", "MP-004", "MP-005"]);
    const finalSnap = await getDoc(ref);
    expect(finalSnap.data()?.customer).toBe(5);
  });
});
