import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CustomerFeedbackPage } from "../CustomerFeedbackPage";
import * as feedbackHookModule from "../../hooks/useCustomerFeedback";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../hooks/useCustomerFeedback", () => ({
  useCustomerFeedback: vi.fn(),
}));

vi.mock("../../components/FeedbackModal", () => ({
  FeedbackModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mock-feedback-modal">Mock Feedback Modal</div> : null,
}));

describe("CustomerFeedbackPage", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  const mockFeedbackList = [
    {
      id: "fb-101",
      customerId: "auth-uid-customer-1",
      category: "food_quality" as const,
      message: "The sambar was too spicy today.",
      status: "new" as const,
      createdAt: { toDate: () => new Date("2026-10-01T08:30:00Z") } as any,
      updatedAt: { toDate: () => new Date("2026-10-01T08:30:00Z") } as any,
    },
    {
      id: "fb-102",
      customerId: "auth-uid-customer-1",
      category: "delivery_issue" as const,
      message: "Delivery was delayed by 30 minutes.",
      status: "investigating" as const,
      createdAt: { toDate: () => new Date("2026-10-02T09:00:00Z") } as any,
      updatedAt: { toDate: () => new Date("2026-10-02T10:15:00Z") } as any,
    },
    {
      id: "fb-103",
      customerId: "auth-uid-customer-1",
      category: "packaging" as const,
      message: "Tiffin container lid was cracked.",
      status: "resolved" as const,
      resolutionNotes: "We replaced the container and credited Rs 50 to your account.",
      createdAt: { toDate: () => new Date("2026-10-03T07:45:00Z") } as any,
      updatedAt: { toDate: () => new Date("2026-10-03T11:20:00Z") } as any,
    },
  ];

  it("renders customer feedback tickets with correct categories, messages, and references", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: mockFeedbackList,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    // Check categories
    expect(container?.textContent).toContain("Food Quality");
    expect(container?.textContent).toContain("Delivery Issue / Delay");
    expect(container?.textContent).toContain("Packaging Problem");

    // Check messages
    expect(container?.textContent).toContain("The sambar was too spicy today.");
    expect(container?.textContent).toContain("Delivery was delayed by 30 minutes.");
    expect(container?.textContent).toContain("Tiffin container lid was cracked.");

    // Check references formatted through formatTicketId
    expect(container?.textContent).toContain("TKT-FB101");
    expect(container?.textContent).toContain("TKT-FB102");
    expect(container?.textContent).toContain("TKT-FB103");
  });

  it("renders status badges properly for new, investigating, and resolved states", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: mockFeedbackList,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain("Received");
    expect(container?.textContent).toContain("Under Review");
    expect(container?.textContent).toContain("Resolved");
  });

  it("renders admin resolution response notes and updated/resolved date when present", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [mockFeedbackList[2]], // fb-103 with resolutionNotes
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain("Admin Resolution Response");
    expect(container?.textContent).toContain(
      "We replaced the container and credited Rs 50 to your account.",
    );
    expect(container?.textContent).toContain("Resolved:");
  });

  it("handles missing/empty admin resolution notes safely without error", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [
        {
          id: "fb-104",
          customerId: "auth-uid-customer-1",
          category: "other" as const,
          message: "Just a general query about dinner time.",
          status: "resolved" as const,
          // no resolutionNotes
          createdAt: { toDate: () => new Date("2026-10-04T12:00:00Z") } as any,
          updatedAt: { toDate: () => new Date("2026-10-04T13:00:00Z") } as any,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain("Just a general query about dinner time.");
    expect(container?.textContent).toContain("marked as resolved by our operations team");
  });

  it("shows informational status for new tickets awaiting review", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [mockFeedbackList[0]], // status "new"
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain(
      "Ticket received and queued for review by the operations team.",
    );
  });

  it("shows under investigation status when investigating without notes", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [mockFeedbackList[1]], // status "investigating"
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain(
      "Our operations team is currently investigating this issue.",
    );
  });

  it("renders empty state when customer has no submitted feedback", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain("No Feedback or Support Tickets");
    expect(container?.textContent).toContain("You haven't submitted any feedback yet");
  });

  it("filters tickets by status correctly", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: mockFeedbackList,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    // Click "Resolved" filter button
    const resolvedFilterBtn = Array.from(container?.querySelectorAll("button") || []).find((b) =>
      b.textContent?.includes("Resolved"),
    );
    expect(resolvedFilterBtn).toBeDefined();

    await act(async () => {
      resolvedFilterBtn?.click();
    });

    // Should only show resolved ticket
    expect(container?.textContent).toContain("Tiffin container lid was cracked.");
    expect(container?.textContent).not.toContain("The sambar was too spicy today.");
    expect(container?.textContent).not.toContain("Delivery was delayed by 30 minutes.");
  });

  it("renders loading state when fetching tickets", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    // LoadingScreen renders a spinner / loading elements
    expect(container?.innerHTML).toBeTruthy();
    expect(container?.textContent).not.toContain("My Feedback & Tickets");
  });

  it("renders error state when request fails and allows retry", async () => {
    const mockRefetch = vi.fn();
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error("Network timeout loading feedback"),
      refetch: mockRefetch,
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.textContent).toContain("Failed to load feedback");
    expect(container?.textContent).toContain("Network timeout loading feedback");

    const retryBtn = Array.from(container?.querySelectorAll("button") || []).find(
      (b) => b.textContent?.toLowerCase().includes("try again") || b.textContent?.toLowerCase().includes("retry"),
    );
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn?.click();
    });

    expect(mockRefetch).toHaveBeenCalled();
  });

  it("does not expose customer inputs to edit admin-only resolution notes or statuses", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: mockFeedbackList,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    // Customer should have NO dropdowns to modify status or textareas to modify resolution notes
    const statusSelects = container?.querySelectorAll("select");
    expect(statusSelects?.length).toBe(0);

    const editableTextareas = container?.querySelectorAll("textarea");
    expect(editableTextareas?.length).toBe(0);
  });

  it("opens FeedbackModal when clicking Report an Issue", async () => {
    vi.mocked(feedbackHookModule.useCustomerFeedback).mockReturnValue({
      data: mockFeedbackList,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await act(async () => {
      root?.render(<CustomerFeedbackPage />);
    });

    expect(container?.querySelector("[data-testid='mock-feedback-modal']")).toBeNull();

    const reportBtn = container?.querySelector("#report-issue-btn") as HTMLButtonElement;
    expect(reportBtn).toBeDefined();

    await act(async () => {
      reportBtn.click();
    });

    expect(container?.querySelector("[data-testid='mock-feedback-modal']")).not.toBeNull();
  });
});
