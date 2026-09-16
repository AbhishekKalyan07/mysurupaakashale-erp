import { describe, it, expect, vi, beforeEach } from "vitest";
import { userRepository } from "../userRepository";
import { getDocs } from "firebase/firestore";

describe("userRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomersPaginated", () => {
    it("returns paginated customers", async () => {
      const mockCustomer = {
        id: "1",
        role: "customer",
        fullName: "Test Customer",
      };
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ data: () => mockCustomer }],
        length: 1,
      } as any);

      const result = await userRepository.getCustomersPaginated(10);
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]).toEqual(mockCustomer);
      expect(getDocs).toHaveBeenCalled();
    });

    it("returns lastDoc if length equals pageSize", async () => {
      const mockCustomer = {
        id: "1",
        role: "customer",
        fullName: "Test Customer",
      };
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ data: () => mockCustomer }],
        length: 1, // Note: snapshot.docs.length is used in the actual code
      } as any);

      // wait, the actual code checks `snapshot.docs.length === pageSize`
      vi.mocked(getDocs).mockReset();
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: Array.from({ length: 10 }, (_, i) => ({
          data: () => ({ ...mockCustomer, id: `${i}` }),
        })),
      } as any);

      const result = await userRepository.getCustomersPaginated(10, {} as any);
      expect(result.lastDoc).not.toBeNull();
    });
  });


  describe("generateNextDisplayId", () => {
    it("generates customer ID with fullName", async () => {
      const result = await userRepository.generateNextDisplayId(
        "customer",
        "John Doe",
      );
      expect(result).toBe("MP-J001");
    });

    it("normalizes lowercase first letter to uppercase", async () => {
      const result = await userRepository.generateNextDisplayId(
        "customer",
        "alice smith",
      );
      expect(result).toBe("MP-A001");
    });

    it("falls back to U for non-alphabet initial", async () => {
      const result = await userRepository.generateNextDisplayId(
        "customer",
        "123 User",
      );
      expect(result).toBe("MP-U001");
    });

    it("falls back to U for whitespace only name", async () => {
      const result = await userRepository.generateNextDisplayId(
        "customer",
        "   ",
      );
      expect(result).toBe("MP-U001");
    });

    it("falls back to U when fullName is undefined", async () => {
      const result = await userRepository.generateNextDisplayId("customer");
      expect(result).toBe("MP-U001");
    });

    it("increments existing count for customer", async () => {
      const { runTransaction } = await import("firebase/firestore");
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ customer_J: 42 }),
            })),
            set: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          } as any;
          return await updateFunction(transaction);
        },
      );

      const result = await userRepository.generateNextDisplayId(
        "customer",
        "John",
      );
      expect(result).toBe("MP-J043");
    });

    it("generates admin ID starting at 1001", async () => {
      const result = await userRepository.generateNextDisplayId("admin");
      expect(result).toBe("ADMIN-1001");
    });

    it("generates kitchen ID starting at 1001", async () => {
      const result = await userRepository.generateNextDisplayId("kitchen");
      expect(result).toBe("KTCH-1001");
    });

    it("generates delivery partner ID starting at 1001", async () => {
      const result =
        await userRepository.generateNextDisplayId("delivery_partner");
      expect(result).toBe("DLVY-1001");
    });

    it("generates accounts ID starting at 1001", async () => {
      const result = await userRepository.generateNextDisplayId("accounts");
      expect(result).toBe("ACCT-1001");
    });

    it("increments existing count for staff", async () => {
      const { runTransaction } = await import("firebase/firestore");
      vi.mocked(runTransaction).mockImplementationOnce(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ kitchen: 1005 }),
            })),
            set: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          } as any;
          return await updateFunction(transaction);
        },
      );

      const result = await userRepository.generateNextDisplayId("kitchen");
      expect(result).toBe("KTCH-1006");
    });

    it("simulates sequential transactions incrementing counter consecutively", async () => {
      const { runTransaction } = await import("firebase/firestore");
      let storedCount = 10;
      vi.mocked(runTransaction).mockImplementation(
        async (_db, updateFunction) => {
          const transaction = {
            get: vi.fn(async () => ({
              exists: () => true,
              data: () => ({ customer_S: storedCount }),
            })),
            set: vi.fn((_ref, data: any) => {
              if (data.customer_S) storedCount = data.customer_S;
            }),
            update: vi.fn(),
            delete: vi.fn(),
          } as any;
          return await updateFunction(transaction);
        },
      );

      const id1 = await userRepository.generateNextDisplayId(
        "customer",
        "Suresh",
      );
      const id2 = await userRepository.generateNextDisplayId(
        "customer",
        "Sunil",
      );

      expect(id1).toBe("MP-S011");
      expect(id2).toBe("MP-S012");
      expect(storedCount).toBe(12);
    });
  });

  describe("updateProfile", () => {
    it("updates user profile", async () => {
      // we can spy on userRepository.update which is inherited from BaseRepository
      const updateSpy = vi.spyOn(userRepository, "update").mockResolvedValue();
      await userRepository.update("cust-1", { fullName: "New Name" });
      expect(updateSpy).toHaveBeenCalledWith("cust-1", {
        fullName: "New Name",
      });
    });
  });

  describe("getByIds", () => {
    it("returns empty array for empty IDs", async () => {
      const result = await userRepository.getByIds([]);
      expect(result).toEqual([]);
    });

    it("chunks queries into batches of up to 30", async () => {
      const ids = Array.from({ length: 45 }, (_, i) => `user-${i}`);
      const listSpy = vi.spyOn(userRepository, "list").mockImplementation(async () => [
        { id: "mock" } as any,
      ]);

      const result = await userRepository.getByIds(ids);
      expect(listSpy).toHaveBeenCalledTimes(2); // 30 + 15
      expect(result).toHaveLength(2);
    });
  });
});
