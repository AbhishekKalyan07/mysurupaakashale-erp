import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { orderRepository } from "../orderRepository";
import { createMockOrder } from "@/shared/utils/__tests__/factories";

const EXPECTED_PROJECT_ID = "demo-test";
const TEST_ADMIN_APP_NAME = "order-repository-int-test-app";

/**
 * Test-local representation of the raw Firestore workflow document persisted by
 * orderRepository.updateWorkflow (which persists fromStatus/toStatus, in contrast
 * to the production OrderWorkflowHistory interface which specifies previousStatus/newStatus).
 */
interface PersistedWorkflowHistoryDoc {
  id: string;
  fromStatus: string;
  toStatus: string;
  notes?: string | null;
  changedBy: string;
  changedAt?: unknown;
}

// Ensure emulator host variables are set to local emulator ports
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
    // Fail-closed verification with strict exact-value assertions
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
    if (auth.app.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        `[Security] Client Auth app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${auth.app.options.projectId}'`,
      );
    }
    if (adminApp.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        `[Security] Admin app project mismatch: expected '${EXPECTED_PROJECT_ID}', got '${adminApp.options.projectId}'`,
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

    // Check workflow history: assert persisted fields directly without fallbacks or 'as any'
    const history = await orderRepository.getWorkflowHistory("wf-test-id");
    expect(history.length).toBe(1);
    const persistedEntry = history[0] as unknown as PersistedWorkflowHistoryDoc;
    expect(persistedEntry).toMatchObject({
      fromStatus: "scheduled",
      toStatus: "preparing",
      notes: "Started early",
    });
    expect(persistedEntry.changedBy).toBeTruthy();

    // Cross-verify stored document directly through isolated Admin SDK
    const historySnap = await adb
      .collection("orders")
      .doc("wf-test-id")
      .collection("workflowHistory")
      .get();
    expect(historySnap.docs.length).toBe(1);
    const rawStoredDoc = historySnap.docs[0].data();
    expect(rawStoredDoc).toMatchObject({
      fromStatus: "scheduled",
      toStatus: "preparing",
      notes: "Started early",
    });
    expect(rawStoredDoc.changedBy).toBe(ADMIN_UID);
  });
});
