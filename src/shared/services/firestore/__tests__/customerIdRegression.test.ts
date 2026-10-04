import { describe, it, expect, vi, beforeEach } from "vitest";
import { userRepository } from "../userRepository";
import { formatAllottedId, isFormattedDisplayId } from "@/shared/utils/displayId";
import type { UserProfile } from "@/shared/types/user.types";

/**
 * Unit-level regression tests for the continuous Customer ID generator (MP-001, MP-002, ...).
 *
 * Migration, identity preservation, historical snapshots, authorization, and the real
 * Firestore transaction/concurrency behaviour are verified against REAL emulators in:
 *   - tests/migration/customerIdMigration.int.test.ts   (npm run test:migration)
 *   - tests/security/customerId.security.test.ts        (npm run test:security)
 *   - tests/security/userCounters.security.test.ts      (npm run test:security)
 */

/** In-memory serialized stand-in for a Firestore transaction on settings/userCounters. */
async function installCounter(initial: number | null) {
  const { runTransaction } = await import("firebase/firestore");
  const state = { customer: initial };
  vi.mocked(runTransaction).mockImplementation(async (_db, updateFunction) => {
    const transaction = {
      get: vi.fn(async () => ({
        exists: () => state.customer !== null,
        data: () => (state.customer === null ? {} : { customer: state.customer }),
      })),
      set: vi.fn((_ref, data: any) => {
        if (typeof data.customer === "number") state.customer = data.customer;
      }),
      update: vi.fn(),
      delete: vi.fn(),
    } as any;
    return await updateFunction(transaction);
  });
  return state;
}

describe("Customer ID generator (continuous MP-001 format)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. first customer gets exactly MP-001 (no initials)", async () => {
    await installCounter(null);
    const id = await userRepository.generateNextDisplayId("customer", "Abhishek Kalyan");
    expect(id).toBe("MP-001");
    expect(id).toMatch(/^MP-\d{3,}$/);
  });

  it("2. sequential customers receive continuous numbering", async () => {
    const state = await installCounter(0);
    const ids = [
      await userRepository.generateNextDisplayId("customer", "One"),
      await userRepository.generateNextDisplayId("customer", "Two"),
      await userRepository.generateNextDisplayId("customer", "Three"),
    ];
    expect(ids).toEqual(["MP-001", "MP-002", "MP-003"]);
    expect(state.customer).toBe(3);
  });

  it("3. continues from the highest assigned number (127 -> MP-128), grows past 3 digits, never restarts", async () => {
    const state = await installCounter(127);
    expect(await userRepository.generateNextDisplayId("customer")).toBe("MP-128");
    state.customer = 999;
    expect(await userRepository.generateNextDisplayId("customer")).toBe("MP-1000");
  });

  it("4. customer name has no influence on the ID", async () => {
    await installCounter(50);
    const ids = [
      await userRepository.generateNextDisplayId("customer", "Ananya Sharma"),
      await userRepository.generateNextDisplayId("customer", "Pradeep Kumar"),
      await userRepository.generateNextDisplayId("customer", "Rahul Dravid"),
      await userRepository.generateNextDisplayId("customer", "Zoya Akhtar"),
      await userRepository.generateNextDisplayId("customer", ""),
      await userRepository.generateNextDisplayId("customer"),
    ];
    expect(ids).toEqual(["MP-051", "MP-052", "MP-053", "MP-054", "MP-055", "MP-056"]);
  });

  it("5. legacy formats (MP-A001, MP-P001, MP-R001, MP-U000) are never generated", async () => {
    await installCounter(3);
    for (const name of ["Ananya", "Pradeep", "Rahul", "", "123 Numeric", "!!"]) {
      const id = await userRepository.generateNextDisplayId("customer", name);
      expect(id).not.toMatch(/^MP-[A-Za-z]/);
      expect(id).toMatch(/^MP-\d+$/);
    }
  });

  it("6. uses a transaction (atomic read-modify-write), not a bare read then write", async () => {
    await installCounter(0);
    const { runTransaction } = await import("firebase/firestore");
    await userRepository.generateNextDisplayId("customer");
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it("7. staff ID formats are unchanged", async () => {
    await installCounter(0);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockImplementation(async (_db, fn) =>
      fn({
        get: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
        set: vi.fn(),
      } as any),
    );
    expect(await userRepository.generateNextDisplayId("admin")).toBe("ADMIN-1001");
    expect(await userRepository.generateNextDisplayId("kitchen")).toBe("KTCH-1001");
    expect(await userRepository.generateNextDisplayId("delivery_partner")).toBe("DLVY-1001");
    expect(await userRepository.generateNextDisplayId("accounts")).toBe("ACCT-1001");
  });

  it("8. admin lookup by Customer ID resolves the profile by UID owner (id !== displayId)", async () => {
    const customer: UserProfile = {
      id: "uid_cust_2",
      displayId: "MP-002",
      fullName: "Pradeep Kumar",
      email: "pradeep@test.com",
      phone: "+919876543210",
      photoUrl: null,
      addresses: [],
      defaultAddressId: null,
      role: "customer",
      isActive: true,
      createdAt: { seconds: 1700000000, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1700000000, nanoseconds: 0 } as any,
    };
    const listSpy = vi.spyOn(userRepository, "list").mockResolvedValue([customer]);
    const found = await userRepository.getByDisplayIdOrPhone("MP-002");
    expect(found?.id).toBe("uid_cust_2");
    expect(found?.id).not.toBe(found?.displayId);
    listSpy.mockRestore();
  });

  it("9. display helpers accept MP-004 and never expose a raw UID as the Customer ID", () => {
    expect(isFormattedDisplayId("MP-004")).toBe(true);
    expect(formatAllottedId("MP-004", "uid-123", "customer")).toBe("MP-004");
    const fallback = formatAllottedId(undefined, "wtea9lQtgPVLLrrUEZVu58392019", "customer");
    expect(fallback.length).toBeLessThan(15);
  });
});
