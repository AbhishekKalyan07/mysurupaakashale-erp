import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { auth, db } from "@/shared/lib/firebase";
import { orderRepository } from "../orderRepository";
import { createMockOrder } from "@/shared/utils/__tests__/factories";

const EXPECTED_PROJECT_ID = "demo-test";
const EXPECTED_DATABASE_ID = "(default)";
const TEST_ADMIN_APP_NAME = "order-repository-int-test-app";

// Ensure emulator host variables are set for Firebase Admin SDK
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

// Use a clearly named test Admin app dedicated to this integration test
const existingApp = getAdminApps().find(
  (app) => app.name === TEST_ADMIN_APP_NAME,
);
const adminApp =
  existingApp && existingApp.options.projectId === EXPECTED_PROJECT_ID
    ? existingApp
    : initAdminApp({ projectId: EXPECTED_PROJECT_ID }, TEST_ADMIN_APP_NAME);

if (adminApp.options.projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `[Security] Admin app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${adminApp.options.projectId}'`,
  );
}

const adb = getAdminFirestore(adminApp);
const aauth = getAdminAuth(adminApp);

const ADMIN_UID = "test-admin-order-repo";

describe("orderRepository (Integration)", () => {
  const testDate = "2026-08-01";

  beforeAll(async () => {
    // Fail-closed verification with strict exact-value assertions on host environment
    if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085") {
      throw new Error(
        `[Security] Refusing to run tests: FIRESTORE_EMULATOR_HOST mismatch: expected '127.0.0.1:8085', got '${process.env.FIRESTORE_EMULATOR_HOST}'`,
      );
    }
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
      throw new Error(
        `[Security] Refusing to run tests: FIREBASE_AUTH_EMULATOR_HOST mismatch: expected '127.0.0.1:9099', got '${process.env.FIREBASE_AUTH_EMULATOR_HOST}'`,
      );
    }

    // Verify Client SDK instances are connected to expected emulators, project, and default database
    if (auth.app.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        `[Security] Client Auth app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${auth.app.options.projectId}'`,
      );
    }
    if (db.app.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        `[Security] Client Firestore app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${db.app.options.projectId}'`,
      );
    }
    // Auth SDK exposes typed emulatorConfig publicly
    if (
      auth.emulatorConfig?.host !== "127.0.0.1" ||
      auth.emulatorConfig?.port !== 9099
    ) {
      throw new Error(
        `[Security] Client Auth not connected to emulator: expected 127.0.0.1:9099, got ${auth.emulatorConfig?.host}:${auth.emulatorConfig?.port}`,
      );
    }
    // In src/shared/lib/firebase.ts, connectFirestoreEmulator(db, "127.0.0.1", 8085)
    // runs synchronously during module initialization before any repository operation.
    // getFirestore(db.app) returns the default database instance associated with the app.
    if (getFirestore(db.app) !== db) {
      throw new Error(
        `[Security] Client Firestore instance mismatch: exported db is not the default database instance`,
      );
    }

    // Verify dedicated Admin SDK app targeting expected project and default database
    if (adminApp.name !== TEST_ADMIN_APP_NAME) {
      throw new Error(
        `[Security] Dedicated Admin app name mismatch: expected '${TEST_ADMIN_APP_NAME}', got '${adminApp.name}'`,
      );
    }
    if (adminApp.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        `[Security] Admin app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${adminApp.options.projectId}'`,
      );
    }
    if (adb.databaseId !== EXPECTED_DATABASE_ID) {
      throw new Error(
        `[Security] Admin Firestore database mismatch: expected '${EXPECTED_DATABASE_ID}', got '${adb.databaseId}'`,
      );
    }

    // Seed synthetic admin user document in Firestore (rules evaluate /users/{uid} for isAdmin())
    await adb.collection("users").doc(ADMIN_UID).set({
      id: ADMIN_UID,
      role: "admin",
      isActive: true,
      email: "admin-order-repo@example.com",
    });

    // Mint synthetic custom token and sign in client Auth SDK
    const customToken = await aauth.createCustomToken(ADMIN_UID, {
      role: "admin",
    });
    await signInWithCustomToken(auth, customToken);
  });

  afterAll(async () => {
    await signOut(auth);
    try {
      await adb.collection("users").doc(ADMIN_UID).delete();
    } catch {
      // ignore cleanup errors in emulator
    }
  });

  it("creates and retrieves an order", async () => {
    const mockOrder = createMockOrder({ id: undefined, date: testDate });
    const orderId = await orderRepository.create(mockOrder);

    expect(orderId).toBeTruthy();

    const fetched = await orderRepository.getById(orderId);
    expect(fetched).not.toBeNull();
    expect(fetched?.date).toBe(testDate);
    expect(fetched?.id).toBe(orderId);
  });

  it("returns null for missing document", async () => {
    const fetched = await orderRepository.getById("non-existent-id");
    expect(fetched).toBeNull();
  });

  it("updates an order", async () => {
    const mockOrder = createMockOrder({
      id: undefined,
      date: testDate,
      status: "scheduled",
    });
    const orderId = await orderRepository.create(mockOrder);

    await orderRepository.update(orderId, { status: "preparing" });
    const fetched = await orderRepository.getById(orderId);
    expect(fetched?.status).toBe("preparing");
  });

  it("prevents hard deletion of an order (enforces security rules)", async () => {
    const mockOrder = createMockOrder({ id: undefined, date: testDate });
    const orderId = await orderRepository.create(mockOrder);

    // Hard deletion of order records is strictly forbidden in firestore.rules (allow delete: if false)
    await expect(orderRepository.delete(orderId)).rejects.toMatchObject({
      code: "permission-denied",
    });

    // Verify order document remains intact
    const fetched = await orderRepository.getById(orderId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(orderId);
  });

  it("supports queries with filtering and sorting", async () => {
    await orderRepository.batchCreate([
      createMockOrder({ date: testDate, mealType: "lunch", routeSequence: 2 }),
      createMockOrder({ date: testDate, mealType: "lunch", routeSequence: 1 }),
      createMockOrder({ date: testDate, mealType: "dinner", routeSequence: 1 }),
    ]);

    const lunchOrders = await orderRepository.getByDateAndMealType(
      testDate,
      "lunch",
    );
    expect(lunchOrders.length).toBeGreaterThanOrEqual(2);
    // Sequence sorting verification
    const seq1 = lunchOrders.findIndex((o) => o.routeSequence === 1);
    const seq2 = lunchOrders.findIndex((o) => o.routeSequence === 2);
    expect(seq1).toBeLessThan(seq2);
  });

  it("handles transactions (optimistic concurrency) via updateWorkflow", async () => {
    const mockOrder = createMockOrder({
      id: "wf-test-id",
      status: "scheduled",
    });
    await orderRepository.create(mockOrder, "wf-test-id");

    await orderRepository.updateWorkflow(
      "wf-test-id",
      "preparing",
      "Started early",
    );

    const fetched = await orderRepository.getById("wf-test-id");
    expect(fetched?.status).toBe("preparing");

    // Check workflow history via declared public contract (OrderWorkflowHistory)
    const history = await orderRepository.getWorkflowHistory("wf-test-id");
    expect(history.length).toBe(1);
    const historyEntry = history[0];
    expect(historyEntry.id).toBeTruthy();
    expect(historyEntry.previousStatus).toBe("scheduled");
    expect(historyEntry.newStatus).toBe("preparing");
    expect(historyEntry.changedBy).toBe(ADMIN_UID);
    expect(historyEntry.changedAt).toBeDefined();
    expect(typeof historyEntry.notes).toBe("string");
    expect(historyEntry.notes).toBe("Started early");

    // Cross-verify raw persisted document separately through isolated Admin SDK
    const historySnap = await adb
      .collection("orders")
      .doc("wf-test-id")
      .collection("workflowHistory")
      .get();
    expect(historySnap.docs.length).toBe(1);
    const rawStoredDoc = historySnap.docs[0];
    expect(rawStoredDoc.exists).toBe(true);
    expect(rawStoredDoc.id).toBe(historyEntry.id);
    const rawStoredData = rawStoredDoc.data();
    expect(rawStoredData.fromStatus).toBe("scheduled");
    expect(rawStoredData.toStatus).toBe("preparing");
    expect(rawStoredData.changedBy).toBe(ADMIN_UID);
    expect(rawStoredData.changedAt).toBeDefined();
    expect(rawStoredData.notes).toBe("Started early");

    // Advance workflow again without notes to verify omitted/null notes contract and ordering
    await orderRepository.updateWorkflow("wf-test-id", "packing");
    const updatedHistory = await orderRepository.getWorkflowHistory("wf-test-id");
    expect(updatedHistory.length).toBe(2);

    // Public contract on latest entry: notes is undefined (satisfies optional string notes?: string)
    const latestHistoryEntry = updatedHistory[0];
    expect(latestHistoryEntry.id).toBeTruthy();
    expect(latestHistoryEntry.previousStatus).toBe("preparing");
    expect(latestHistoryEntry.newStatus).toBe("packing");
    expect(latestHistoryEntry.changedBy).toBe(ADMIN_UID);
    expect(latestHistoryEntry.changedAt).toBeDefined();
    expect(latestHistoryEntry.notes).toBeUndefined();

    // Raw persisted document in Admin SDK stores notes as null per write contract (notes || null)
    const latestDocSnap = await adb
      .collection("orders")
      .doc("wf-test-id")
      .collection("workflowHistory")
      .doc(latestHistoryEntry.id)
      .get();
    expect(latestDocSnap.exists).toBe(true);
    const latestStoredData = latestDocSnap.data();
    expect(latestStoredData?.fromStatus).toBe("preparing");
    expect(latestStoredData?.toStatus).toBe("packing");
    expect(latestStoredData?.changedBy).toBe(ADMIN_UID);
    expect(latestStoredData?.changedAt).toBeDefined();
    expect(latestStoredData?.notes).toBeNull();
  });
});
