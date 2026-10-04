import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ID = "mysuru-paakashale-erp-sec-css";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
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
});

describe("Customer Self-Service Security Regression", () => {
  const CUSTOMER_UID = "customer123";
  const OTHER_UID = "customer999";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Setup Customer Profile
      await setDoc(doc(db, "users", CUSTOMER_UID), {
        id: CUSTOMER_UID,
        role: "customer",
        isActive: true,
        addresses: [],
      });

      // Setup Other Customer Profile
      await setDoc(doc(db, "users", OTHER_UID), {
        id: OTHER_UID,
        role: "customer",
        isActive: true,
        addresses: [],
      });

      // Setup an active scheduled order for the customer today (mocked to a valid open date)
      // Using a static future date so it's always open
      await setDoc(doc(db, "orders", "order_cust_1"), {
        id: "order_cust_1",
        customerId: CUSTOMER_UID,
        status: "scheduled",
        date: "2099-01-01", // future date to bypass cutoff
        mealType: "lunch",
        price: 150,
        kitchenStatus: "scheduled",
        createdAt: new Date(),
        updatedAt: new Date(),
        subscriptionId: "sub_1",
        source: "subscription"
      });

      // Setup terminal order
      await setDoc(doc(db, "orders", "order_term_1"), {
        id: "order_term_1",
        customerId: CUSTOMER_UID,
        status: "delivered",
        date: "2020-01-01",
        mealType: "lunch",
        price: 150,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Setup another customer's order
      await setDoc(doc(db, "orders", "order_other_1"), {
        id: "order_other_1",
        customerId: OTHER_UID,
        status: "scheduled",
        date: "2099-01-01",
        mealType: "lunch",
        price: 150,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  });

  it("Customer CAN update legitimate own profile/address data", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "users", CUSTOMER_UID);

    await expect(updateDoc(ref, {
      addresses: [{ id: "addr_1", line1: "123 Main St", city: "Mysuru", pincode: "570001" }]
    })).resolves.not.toThrow();
  });

  it("Customer CAN cancel eligible own order", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "orders", "order_cust_1");

    await expect(updateDoc(ref, {
      status: "cancelled",
      updatedAt: new Date()
    })).resolves.not.toThrow();
  });

  it("Customer CANNOT change operational fields (driverName, zoneName, etc.) on their own scheduled order", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "orders", "order_cust_1");

    // Attempting to spoof operational routing data
    await expect(updateDoc(ref, {
      driverName: "Malicious Driver",
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);

    await expect(updateDoc(ref, {
      zoneName: "Fake Zone",
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);

    await expect(updateDoc(ref, {
      customerCode: "CUST-HACKED",
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("Customer CANNOT change another customer's order", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "orders", "order_other_1");

    await expect(updateDoc(ref, {
      status: "cancelled",
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("Customer CANNOT modify terminal/historical orders", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "orders", "order_term_1");

    await expect(updateDoc(ref, {
      status: "scheduled",
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("Customer CANNOT modify protected financial/order fields", async () => {
    const custDb = testEnv.authenticatedContext(CUSTOMER_UID).firestore();
    const ref = doc(custDb, "orders", "order_cust_1");

    await expect(updateDoc(ref, {
      price: 1, // trying to get it for cheap!
      updatedAt: new Date()
    })).rejects.toThrow(/PERMISSION_DENIED/);
  });
});
