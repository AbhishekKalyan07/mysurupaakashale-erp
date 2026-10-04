import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

/**
 * REAL emulator verification of the legacy Customer ID migration.
 *
 * Requires BOTH the Auth and Firestore emulators:
 *   npm run test:migration
 *
 * Seeds representative LEGACY customers (MP-A001 / MP-P001 / MP-R001) with real
 * Firebase Auth users, runs the real migration function, then verifies identity,
 * ownership, historical snapshots, counter continuity, and that the real
 * generateNextDisplayId() (client SDK, security rules enforced) yields MP-004.
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PROJECT_ID = "demo-test";

// The real userRepository imports `db` from "@/shared/lib/firebase". Point it at a
// rules-enforced emulator client authenticated as a brand-new customer.
const holder = vi.hoisted(() => ({ env: null as unknown as RulesTestEnvironment }));
vi.mock("@/shared/lib/firebase", async () => {
  const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
  const nodeFs = await import("fs");
  const nodePath = await import("path");
  holder.env = await initializeTestEnvironment({
    projectId: "demo-test",
    firestore: {
      rules: nodeFs.readFileSync(nodePath.resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });
  return { db: holder.env.authenticatedContext("brandNewCustomer", { role: "customer" }).firestore() };
});

import { migrateCustomerDisplayIds } from "../../scripts/migrate-customers";
import { userRepository } from "../../src/shared/services/firestore/userRepository";

const adminApp = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const adb = getFirestore(adminApp);
const aauth = getAuth(adminApp);

interface Seeded {
  uid: string;
  email: string;
  legacyId: string;
  name: string;
  createdMs: number;
}

const seeded: Seeded[] = [];
let staffUid = "";
let beforeDocs: Record<string, FirebaseFirestore.DocumentData> = {};

describe("Legacy customer ID migration — real emulator data", () => {
  beforeAll(async () => {
    // Representative legacy customers. Creation order deliberately DIFFERS from letter
    // order so that the result proves the ordering is createdAt, not name/initial.
    const specs = [
      { name: "Rahul Dravid", email: "rahul@legacy.test", legacyId: "MP-R001", createdMs: Date.parse("2026-01-10T10:00:00Z") },
      { name: "Ananya Sharma", email: "ananya@legacy.test", legacyId: "MP-A001", createdMs: Date.parse("2026-02-10T10:00:00Z") },
      { name: "Pradeep Kumar", email: "pradeep@legacy.test", legacyId: "MP-P001", createdMs: Date.parse("2026-03-10T10:00:00Z") },
    ];

    for (const s of specs) {
      try {
        const existing = await aauth.getUserByEmail(s.email);
        await aauth.deleteUser(existing.uid);
      } catch { /* not present */ }
      const rec = await aauth.createUser({ email: s.email, password: "legacy-pass-1", displayName: s.name });
      seeded.push({ ...s, uid: rec.uid });

      await adb.collection("users").doc(rec.uid).set({
        id: rec.uid,
        role: "customer",
        fullName: s.name,
        email: s.email,
        phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`,
        displayId: s.legacyId,
        isActive: true,
        addresses: [{ id: "addr1", line1: `${s.name} street`, city: "Mysuru", pincode: "570001" }],
        defaultAddressId: "addr1",
        createdAt: Timestamp.fromMillis(s.createdMs),
        updatedAt: Timestamp.fromMillis(s.createdMs),
      });
      await adb.collection("users").doc(rec.uid).collection("addresses").doc("addr1").set({ line1: "sub-address" });

      // Live references (by UID) + historical snapshots (by code) that must NOT be rewritten
      await adb.collection("orders").doc(`order_${rec.uid}`).set({
        customerId: rec.uid, customerCode: s.legacyId, displayId: `ORD-${s.legacyId}`,
        status: "delivered", date: "2026-02-01", price: 150,
      });
      await adb.collection("subscriptions").doc(`sub_${rec.uid}`).set({
        customerId: rec.uid, customerDisplayId: s.legacyId, status: "active",
      });
      await adb.collection("payments").doc(`pay_${rec.uid}`).set({
        customerId: rec.uid, customerDisplayId: s.legacyId, status: "verified", amount: 150,
      });
    }

    // Staff user must be untouched by a CUSTOMER migration
    const staff = await aauth.createUser({ email: `kitchen-${Date.now()}@legacy.test`, password: "legacy-pass-1" });
    staffUid = staff.uid;
    await adb.collection("users").doc(staffUid).set({
      id: staffUid, role: "kitchen", fullName: "Kitchen Staff", displayId: "KTCH-1001", isActive: true,
    });

    // Legacy per-initial counters, as produced by the OLD generator
    await adb.collection("settings").doc("userCounters").set({
      customer_A: 1, customer_P: 1, customer_R: 1, kitchen: 1001,
    });

    const snap = await adb.collection("users").get();
    beforeDocs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  });

  afterAll(async () => {
    if (holder.env) await holder.env.cleanup();
  });

  it("A. seeds 3 legacy customers with the old MP-<initial>NNN format", () => {
    expect(seeded).toHaveLength(3);
    for (const s of seeded) expect(s.legacyId).toMatch(/^MP-[A-Z]\d{3}$/);
  });

  it("B. migration assigns MP-001..MP-003 deterministically by createdAt (not by name/initial)", async () => {
    const result = await migrateCustomerDisplayIds(adb);
    expect(result.totalCustomers).toBe(3);
    expect(result.migratedCount).toBe(3);
    const byName = Object.fromEntries(result.mappings.map((m) => [m.fullName, m]));
    expect(byName["Rahul Dravid"].oldDisplayId).toBe("MP-R001");
    expect(byName["Rahul Dravid"].newDisplayId).toBe("MP-001");
    expect(byName["Ananya Sharma"].oldDisplayId).toBe("MP-A001");
    expect(byName["Ananya Sharma"].newDisplayId).toBe("MP-002");
    expect(byName["Pradeep Kumar"].oldDisplayId).toBe("MP-P001");
    expect(byName["Pradeep Kumar"].newDisplayId).toBe("MP-003");
    console.log("MIGRATION RESULT:", JSON.stringify(result.mappings.map((m) => `${m.fullName}: ${m.oldDisplayId} -> ${m.newDisplayId}`)));
  });

  it("C. persisted state: unique, continuous, correct IDs; nothing else on the profile changed", async () => {
    const snap = await adb.collection("users").where("role", "==", "customer").get();
    const ids = snap.docs.map((d) => d.data().displayId).sort();
    expect(ids).toEqual(["MP-001", "MP-002", "MP-003"]);
    expect(new Set(ids).size).toBe(3);

    for (const d of snap.docs) {
      const before = beforeDocs[d.id];
      const after = d.data();
      const { displayId: _bd, updatedAt: _bu, ...beforeRest } = before;
      const { displayId: _ad, updatedAt: _au, ...afterRest } = after;
      expect(afterRest).toEqual(beforeRest); // role, email, phone, addresses, createdAt, id ... identical
    }
  });

  it("D. Firebase Auth identity is unchanged (same UID, same email, still resolvable)", async () => {
    for (const s of seeded) {
      const rec = await aauth.getUser(s.uid);
      expect(rec.uid).toBe(s.uid);
      expect(rec.email).toBe(s.email);
      const byEmail = await aauth.getUserByEmail(s.email);
      expect(byEmail.uid).toBe(s.uid);
      const profile = await adb.collection("users").doc(s.uid).get();
      expect(profile.exists).toBe(true);
      expect(profile.data()?.id).toBe(s.uid);
    }
  });

  it("E. addresses, orders, subscriptions and payments remain linked to the same UID", async () => {
    for (const s of seeded) {
      const addr = await adb.collection("users").doc(s.uid).collection("addresses").doc("addr1").get();
      expect(addr.exists).toBe(true);
      expect((await adb.collection("orders").doc(`order_${s.uid}`).get()).data()?.customerId).toBe(s.uid);
      expect((await adb.collection("subscriptions").doc(`sub_${s.uid}`).get()).data()?.customerId).toBe(s.uid);
      expect((await adb.collection("payments").doc(`pay_${s.uid}`).get()).data()?.customerId).toBe(s.uid);
    }
  });

  it("F. historical locked snapshots are NOT rewritten (audit integrity)", async () => {
    for (const s of seeded) {
      const order = (await adb.collection("orders").doc(`order_${s.uid}`).get()).data()!;
      expect(order.customerCode).toBe(s.legacyId);
      expect(order.displayId).toBe(`ORD-${s.legacyId}`);
      expect((await adb.collection("subscriptions").doc(`sub_${s.uid}`).get()).data()?.customerDisplayId).toBe(s.legacyId);
      expect((await adb.collection("payments").doc(`pay_${s.uid}`).get()).data()?.customerDisplayId).toBe(s.legacyId);
    }
  });

  it("G. staff profiles are untouched and the staff counter is preserved", async () => {
    const staff = (await adb.collection("users").doc(staffUid).get()).data()!;
    expect(staff.displayId).toBe("KTCH-1001");
    expect(staff.role).toBe("kitchen");
    const counters = (await adb.collection("settings").doc("userCounters").get()).data()!;
    expect(counters.kitchen).toBe(1001);
  });

  it("H. counter is synchronized: userCounters.customer === 3", async () => {
    const counters = (await adb.collection("settings").doc("userCounters").get()).data()!;
    expect(counters.customer).toBe(3);
  });

  it("I. migration is idempotent/deterministic: a second run yields the identical assignment", async () => {
    const snapBefore = await adb.collection("users").where("role", "==", "customer").get();
    const map1 = Object.fromEntries(snapBefore.docs.map((d) => [d.id, d.data().displayId]));
    await migrateCustomerDisplayIds(adb);
    const snapAfter = await adb.collection("users").where("role", "==", "customer").get();
    const map2 = Object.fromEntries(snapAfter.docs.map((d) => [d.id, d.data().displayId]));
    expect(map2).toEqual(map1);
    expect((await adb.collection("settings").doc("userCounters").get()).data()?.customer).toBe(3);
  });

  it("J. REAL generateNextDisplayId() (client SDK + security rules) gives the next new customer MP-004", async () => {
    const id = await userRepository.generateNextDisplayId("customer", "Zoya Akhtar");
    expect(id).toBe("MP-004");
    expect(id).not.toMatch(/MP-[A-Z]\d+/);
  });

  it("K. concurrent REAL allocations after migration never duplicate (MP-005..MP-007)", async () => {
    const ids = await Promise.all([
      userRepository.generateNextDisplayId("customer", "Alpha"),
      userRepository.generateNextDisplayId("customer", "Beta"),
      userRepository.generateNextDisplayId("customer", "Gamma"),
    ]);
    expect(new Set(ids).size).toBe(3);
    expect([...ids].sort()).toEqual(["MP-005", "MP-006", "MP-007"]);
    expect((await adb.collection("settings").doc("userCounters").get()).data()?.customer).toBe(7);
  });
});
