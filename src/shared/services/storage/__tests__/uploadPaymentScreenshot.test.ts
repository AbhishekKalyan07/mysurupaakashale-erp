import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadPaymentScreenshot } from "../uploadPaymentScreenshot";

// Mock Firebase auth
vi.mock("@/shared/lib/firebase", () => ({
  auth: {
    currentUser: { uid: "test-user-123" },
  },
}));

describe("uploadPaymentScreenshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compresses and returns data URL when canvas succeeds", async () => {
    const mockToDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,smallImage");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(mockToDataURL);

    // Mock Image in jsdom
    const originalImage = window.Image;
    class MockImage {
      width = 800;
      height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    window.Image = MockImage as any;

    try {
      const file = new File(["dummy content"], "receipt.jpg", {
        type: "image/jpeg",
      });

      const result = await uploadPaymentScreenshot(file);
      expect(result).toBe("data:image/jpeg;base64,smallImage");
      expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.6);
    } finally {
      window.Image = originalImage;
    }
  });

  it("rejects if user is not signed in", async () => {
    const { auth } = await import("@/shared/lib/firebase");
    (auth as any).currentUser = null;

    const file = new File(["dummy content"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await expect(uploadPaymentScreenshot(file)).rejects.toThrow(
      "Must be signed in to upload a payment screenshot.",
    );

    (auth as any).currentUser = { uid: "test-user-123" };
  });

  it("rejects cleanly if image decoding fails in Image.onerror", async () => {
    const originalImage = window.Image;
    class MockFailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    window.Image = MockFailingImage as any;

    try {
      const file = new File(["corrupt data"], "corrupt.jpg", {
        type: "image/jpeg",
      });

      await expect(uploadPaymentScreenshot(file)).rejects.toThrow(
        "Failed to decode image file. Please upload a valid JPEG, PNG, or WebP photo.",
      );
    } finally {
      window.Image = originalImage;
    }
  });

  it("rejects if compressed data URL exceeds 150 KB ceiling", async () => {
    // Return a string larger than 150,000 characters
    const oversizedData = "data:image/jpeg;base64," + "A".repeat(150001);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(oversizedData);

    const originalImage = window.Image;
    class MockImage {
      width = 400;
      height = 400;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    window.Image = MockImage as any;

    try {
      const file = new File(["dummy content"], "receipt.jpg", {
        type: "image/jpeg",
      });

      await expect(uploadPaymentScreenshot(file)).rejects.toThrow(
        "Screenshot image could not be compressed below maximum allowed size (150 KB)",
      );
    } finally {
      window.Image = originalImage;
    }
  });
});
