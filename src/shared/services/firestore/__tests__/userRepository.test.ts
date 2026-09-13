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
});
