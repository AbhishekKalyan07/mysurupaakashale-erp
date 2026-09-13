import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../src/shared/lib/firebase"; // Using the app's functions instance

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
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Security Finding #9: userCounters and Idempotency Rules", () => {
  it("unauthenticated read/write denied", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const db = unauthed.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { customer_A: 1 })).rejects.toThrowError();
  });

  it("customer read/write denied", async () => {
    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const db = customer.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { customer_A: 1 })).rejects.toThrowError();
    await expect(updateDoc(ref, { customer_A: 1 })).rejects.toThrowError();
    await expect(deleteDoc(ref)).rejects.toThrowError();
  });

  it("delivery read/write denied", async () => {
    const delivery = testEnv.authenticatedContext("dlvy1", { role: "delivery_partner" });
    const db = delivery.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { delivery_partner: 1001 })).rejects.toThrowError();
  });

  it("kitchen read/write denied", async () => {
    const kitchen = testEnv.authenticatedContext("ktch1", { role: "kitchen" });
    const db = kitchen.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { kitchen: 1001 })).rejects.toThrowError();
  });

  it("staff read/write denied", async () => {
    const staff = testEnv.authenticatedContext("acct1", { role: "accounts" });
    const db = staff.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { accounts: 1001 })).rejects.toThrowError();
  });

  it("admin direct client access denied", async () => {
    const admin = testEnv.authenticatedContext("admin1", { role: "admin" });
    const db = admin.firestore();
    const ref = doc(db, "settings/userCounters");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { admin: 1001 })).rejects.toThrowError();
    await expect(updateDoc(ref, { admin: 1002 })).rejects.toThrowError();
    await expect(deleteDoc(ref)).rejects.toThrowError();
  });

  it("idempotency direct client access denied", async () => {
    const customer = testEnv.authenticatedContext("cust1", { role: "customer" });
    const db = customer.firestore();
    const ref = doc(db, "idempotency/displayIds/allocations/cust1");
    await expect(getDoc(ref)).rejects.toThrowError();
    await expect(setDoc(ref, { displayId: "123" })).rejects.toThrowError();
  });
});
