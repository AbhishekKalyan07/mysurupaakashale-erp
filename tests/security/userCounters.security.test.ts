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
} from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-mysuru-paakashale",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
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

describe("Security Rules: settings/userCounters (Spark Compatibility)", () => {
  it("1. unauthenticated read and write are denied", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const db = unauthed.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(getDoc(ref)).rejects.toThrow();
    await expect(setDoc(ref, { customer_A: 1 })).rejects.toThrow();
  });

  it("2. customer can read userCounters document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.customer_A).toBe(5);
  });

  it("3. first customer for a letter initializes counter correctly to 1", async () => {
    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    // Creating document with customer_A: 1
    await expect(setDoc(ref, { customer_A: 1 })).resolves.not.toThrow();

    // Adding customer_B: 1 to existing document via merge
    await expect(
      setDoc(ref, { customer_B: 1 }, { merge: true }),
    ).resolves.not.toThrow();
  });

  it("4. customer cannot initialize a counter with a value other than 1", async () => {
    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(setDoc(ref, { customer_A: 2 })).rejects.toThrow();
    await expect(setDoc(ref, { customer_A: 0 })).rejects.toThrow();
    await expect(setDoc(ref, { customer_A: -1 })).rejects.toThrow();
  });

  it("5. existing counter increments by exactly 1", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(
      updateDoc(ref, { customer_A: 6 }),
    ).resolves.not.toThrow();
  });

  it("6. customer cannot increment by 2", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(updateDoc(ref, { customer_A: 7 })).rejects.toThrow();
  });

  it("7. customer cannot decrement a counter", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(updateDoc(ref, { customer_A: 4 })).rejects.toThrow();
  });

  it("8. customer cannot modify a staff counter", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
        kitchen: 1001,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(updateDoc(ref, { kitchen: 1002 })).rejects.toThrow();
    await expect(setDoc(ref, { delivery_partner: 1001 }, { merge: true })).rejects.toThrow();
  });

  it("9. customer cannot modify multiple counters in one update", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
        customer_B: 2,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(
      updateDoc(ref, { customer_A: 6, customer_B: 3 }),
    ).rejects.toThrow();
  });

  it("10. customer cannot add arbitrary fields", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(
      updateDoc(ref, { arbitraryField: 123 }),
    ).rejects.toThrow();
    await expect(
      setDoc(ref, { customer_A: 6, role: "admin" }, { merge: true }),
    ).rejects.toThrow();
  });

  it("11. customer cannot delete the counter document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/userCounters"), {
        customer_A: 5,
      });
    });

    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(deleteDoc(ref)).rejects.toThrow();
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

    const admin = testEnv.authenticatedContext("admin1", {
      role: "admin",
    });
    const db = admin.firestore();
    const ref = doc(db, "settings/userCounters");

    await expect(
      updateDoc(ref, { kitchen: 1002, delivery_partner: 1001 }),
    ).resolves.not.toThrow();
  });

  it("13. idempotency collection remains denied to all client contexts", async () => {
    const customer = testEnv.authenticatedContext("cust1", {
      role: "customer",
    });
    const db = customer.firestore();
    const ref = doc(db, "idempotency/displayIds/allocations/cust1");

    await expect(getDoc(ref)).rejects.toThrow();
    await expect(setDoc(ref, { displayId: "MP-A001" })).rejects.toThrow();
  });
});
