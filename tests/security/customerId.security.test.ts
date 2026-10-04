import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

/**
 * Customer ID (displayId, e.g. MP-002) is a BUSINESS code. It must never grant access.
 * Authorization is always Firebase Auth UID / ownership.
 */
let testEnv: RulesTestEnvironment;

const A_UID = "uidCustomerA";
const B_UID = "uidCustomerB";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "mysuru-paakashale-erp-sec-custid",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", A_UID), {
      id: A_UID, role: "customer", isActive: true, displayId: "MP-001", fullName: "A",
    });
    await setDoc(doc(db, "users", B_UID), {
      id: B_UID, role: "customer", isActive: true, displayId: "MP-002", fullName: "B",
    });
    await setDoc(doc(db, "users", "legacyNoId"), {
      id: "legacyNoId", role: "customer", isActive: true, fullName: "Legacy",
    });
    await setDoc(doc(db, "orders", "orderB"), {
      id: "orderB", customerId: B_UID, customerCode: "MP-002", status: "scheduled",
      date: "2099-01-01", mealType: "lunch", price: 100,
    });
    await setDoc(doc(db, "payments", "payB"), {
      customerId: B_UID, customerDisplayId: "MP-002", status: "pending", amount: 100,
    });
  });
});

describe("Customer ID is not an authorization credential", () => {
  it("Customer A knowing Customer B's MP-002 cannot read B's profile by UID", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertFails(getDoc(doc(a, "users", B_UID)));
  });

  it("Customer A cannot look up Customer B by querying displayId == MP-002", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertFails(getDocs(query(collection(a, "users"), where("displayId", "==", "MP-002"))));
  });

  it("Customer A cannot read B's orders or payments even when filtering by B's customer code", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertFails(getDoc(doc(a, "orders", "orderB")));
    await assertFails(getDocs(query(collection(a, "orders"), where("customerCode", "==", "MP-002"))));
    await assertFails(getDoc(doc(a, "payments", "payB")));
  });

  it("Customer A cannot write to B's profile", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertFails(updateDoc(doc(a, "users", B_UID), { fullName: "hijacked" }));
  });

  it("Customer B (owner) can still read their own profile", async () => {
    const b = testEnv.authenticatedContext(B_UID, { role: "customer" }).firestore();
    const snap = await assertSucceeds(getDoc(doc(b, "users", B_UID)));
    expect(snap.data()?.displayId).toBe("MP-002");
  });

  it("Admin can find a customer by Customer ID", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "adminUid"), {
        id: "adminUid", role: "admin", isActive: true,
      });
    });
    const admin = testEnv.authenticatedContext("adminUid", { role: "admin" }).firestore();
    const res = await assertSucceeds(
      getDocs(query(collection(admin, "users"), where("displayId", "==", "MP-002"))),
    );
    expect(res.size).toBe(1);
    expect(res.docs[0].id).toBe(B_UID);
  });
});

describe("Customer ID integrity", () => {
  it("a customer cannot change their own assigned Customer ID", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertFails(updateDoc(doc(a, "users", A_UID), { displayId: "MP-002" }));
    await assertFails(updateDoc(doc(a, "users", A_UID), { displayId: "MP-999" }));
  });

  it("a customer can still update other profile fields without touching displayId", async () => {
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    await assertSucceeds(updateDoc(doc(a, "users", A_UID), { fullName: "New Name" }));
  });

  it("a legacy profile with NO displayId can be backfilled by its owner (existing AuthContext flow)", async () => {
    const legacy = testEnv.authenticatedContext("legacyNoId", { role: "customer" }).firestore();
    await assertSucceeds(updateDoc(doc(legacy, "users", "legacyNoId"), { displayId: "MP-003" }));
  });

  it("admin can change a Customer ID without changing ownership/uid", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "adminUid"), {
        id: "adminUid", role: "admin", isActive: true,
      });
    });
    const admin = testEnv.authenticatedContext("adminUid", { role: "admin" }).firestore();
    await assertSucceeds(updateDoc(doc(admin, "users", A_UID), { displayId: "MP-010" }));
    const a = testEnv.authenticatedContext(A_UID, { role: "customer" }).firestore();
    const snap = await assertSucceeds(getDoc(doc(a, "users", A_UID)));
    expect(snap.data()?.displayId).toBe("MP-010");
    expect(snap.data()?.id).toBe(A_UID);
  });
});
