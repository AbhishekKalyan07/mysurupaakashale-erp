import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResumeDeliveryModal } from "../ResumeDeliveryModal";
import type { Subscription } from "@/shared/types";
import { subscriptionService } from "@/shared/services/business/subscriptionService";
import { orderService } from "@/shared/services/business/orderService";
import { setDoc } from "firebase/firestore";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join("/") })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  Timestamp: {},
}));

vi.mock("@/shared/services/business/subscriptionService", () => ({
  subscriptionService: {
    resumeSubscription: vi.fn().mockResolvedValue(undefined),
    pauseSubscription: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/services/business/orderService", () => ({
  orderService: {
    restoreOrdersForUnskipDay: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ResumeDeliveryModal — Authoritative Operational Cutoffs", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let queryClient: QueryClient;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const mockSubscription: Subscription = {
    id: "sub-100",
    customerId: "cust-200",
    planId: "standard-plan",
    status: "paused",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    pauseStartDate: "2026-10-10",
    pauseEndDate: "2026-10-25",
    pricePerDaySnapshot: 350,
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: "opt-b" },
      { mealType: "lunch", selectedOptionId: "opt-l" },
      { mealType: "dinner", selectedOptionId: "opt-d" },
    ],
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container!);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.useRealTimers();
  });

  const renderModal = async (
    subscription: Subscription = mockSubscription,
    nowOverride?: Date,
  ) => {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <ResumeDeliveryModal
            subscription={subscription}
            onClose={vi.fn()}
            nowOverride={nowOverride}
          />
        </QueryClientProvider>,
      );
    });
  };

  it("Before 05:00 IST => all preferred meals can resume today", async () => {
    // 04:30 IST on 2026-10-15 (UTC: 2026-10-14T23:00:00Z)
    const testDate = new Date("2026-10-14T23:00:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("Resume Today");
    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("breakfast & lunch & dinner");
    expect(container!.textContent).not.toContain("Beginning tomorrow:");
    expect(container!.textContent).not.toContain("It is too late to resume deliveries for today");
  });

  it("Exact boundary at 05:00:00 IST => Breakfast not eligible today; Lunch + Dinner eligible", async () => {
    // 05:00:00 IST on 2026-10-15 (UTC: 2026-10-14T23:30:00Z)
    const testDate = new Date("2026-10-14T23:30:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("Resume Today");
    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("lunch & dinner");
    expect(container!.textContent).toContain("Beginning tomorrow:");
    expect(container!.textContent).toContain("breakfast");
    expect(container!.textContent).toContain("05:00 IST");
  });

  it("07:00 IST => Lunch + Dinner today; Breakfast tomorrow", async () => {
    // 07:00:00 IST on 2026-10-15 (UTC: 2026-10-15T01:30:00Z)
    const testDate = new Date("2026-10-15T01:30:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("Resume Today");
    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("lunch & dinner");
    expect(container!.textContent).toContain("Beginning tomorrow:");
    expect(container!.textContent).toContain("breakfast");
  });

  it("Exact boundary at 10:30:00 IST => Breakfast & Lunch not eligible today; Dinner eligible", async () => {
    // 10:30:00 IST on 2026-10-15 (UTC: 2026-10-15T05:00:00Z)
    const testDate = new Date("2026-10-15T05:00:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("Resume Today");
    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("dinner");
    expect(container!.textContent).toContain("Beginning tomorrow:");
    expect(container!.textContent).toContain("breakfast & lunch");
  });

  it("14:00 IST => Dinner today; Breakfast + Lunch tomorrow", async () => {
    // 14:00:00 IST on 2026-10-15 (UTC: 2026-10-15T08:30:00Z)
    const testDate = new Date("2026-10-15T08:30:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("Resume Today");
    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("dinner");
    expect(container!.textContent).toContain("Beginning tomorrow:");
    expect(container!.textContent).toContain("breakfast & lunch");
  });

  it("Exact boundary at 16:00:00 IST => no meals eligible today; defaults to tomorrow", async () => {
    // 16:00:00 IST on 2026-10-15 (UTC: 2026-10-15T10:30:00Z)
    const testDate = new Date("2026-10-15T10:30:00Z");
    await renderModal(mockSubscription, testDate);

    // Resume today should NOT be available
    expect(container!.textContent).toContain("It is too late to resume deliveries for today.");
    expect(container!.textContent).toContain("Resume Tomorrow");
    expect(container!.textContent).toContain("Deliveries will restart automatically starting tomorrow morning.");

    // The tomorrow radio input should be checked
    const tomorrowRadio = container!.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(tomorrowRadio).toBeDefined();
    expect(tomorrowRadio.checked).toBe(true);
  });

  it("After 16:00 IST (16:30 IST) => no meals eligible today; defaults to tomorrow", async () => {
    // 16:30:00 IST on 2026-10-15 (UTC: 2026-10-15T11:00:00Z)
    const testDate = new Date("2026-10-15T11:00:00Z");
    await renderModal(mockSubscription, testDate);

    expect(container!.textContent).toContain("It is too late to resume deliveries for today.");
    expect(container!.textContent).toContain("Resume Tomorrow");

    const radio = container!.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("Controlled fake system time test verifies date-independence", async () => {
    // Test using vi.setSystemTime without passing nowOverride prop
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-25T01:30:00Z")); // 07:00 IST

    await renderModal(mockSubscription, undefined);

    expect(container!.textContent).toContain("Resuming today:");
    expect(container!.textContent).toContain("lunch & dinner");
    expect(container!.textContent).toContain("Beginning tomorrow:");
    expect(container!.textContent).toContain("breakfast");
  });

  it("Submitting today at 07:00 IST creates skip record for breakfast and restores lunch & dinner", async () => {
    const testDate = new Date("2026-10-15T01:30:00Z"); // 07:00 IST
    const onClose = vi.fn();

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <ResumeDeliveryModal
            subscription={mockSubscription}
            onClose={onClose}
            nowOverride={testDate}
          />
        </QueryClientProvider>,
      );
    });

    const confirmButton = Array.from(container!.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Confirm Resume"),
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton!.click();
    });

    // Check setDoc was called for skipped breakfast
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "subscriptions/sub-100/skips/2026-10-15" }),
      expect.objectContaining({
        date: "2026-10-15",
        mealTypes: ["breakfast"],
        reason: "Resumed late in the day",
      }),
    );

    // Check unskip request created for lunch & dinner
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("unskipRequests/sub-100_2026-10-15_") }),
      expect.objectContaining({
        date: "2026-10-15",
        mealTypes: ["lunch", "dinner"],
        status: "pending",
      }),
    );

    // Check restoreOrdersForUnskipDay
    expect(orderService.restoreOrdersForUnskipDay).toHaveBeenCalledWith(
      "cust-200",
      "sub-100",
      "2026-10-15",
      ["lunch", "dinner"],
      false,
    );

    // Check resumeSubscription called
    expect(subscriptionService.resumeSubscription).toHaveBeenCalledWith(mockSubscription);
    expect(onClose).toHaveBeenCalled();
  });

  it("Submitting after 16:00 IST schedules resumption for tomorrow via pauseSubscription", async () => {
    const testDate = new Date("2026-10-15T12:00:00Z"); // 17:30 IST
    const onClose = vi.fn();

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <ResumeDeliveryModal
            subscription={mockSubscription}
            onClose={onClose}
            nowOverride={testDate}
          />
        </QueryClientProvider>,
      );
    });

    const confirmButton = Array.from(container!.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Confirm Resume"),
    );

    await act(async () => {
      confirmButton!.click();
    });

    // Should call pauseSubscription with pauseEndDate set to today
    expect(subscriptionService.pauseSubscription).toHaveBeenCalledWith(
      mockSubscription,
      true,
      mockSubscription.pauseStartDate || "2026-10-15",
      "2026-10-15",
    );
    expect(onClose).toHaveBeenCalled();
  });
});
