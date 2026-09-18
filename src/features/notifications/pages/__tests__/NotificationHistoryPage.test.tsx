import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationHistoryPage } from "../NotificationHistoryPage";
import * as notificationHooks from "@/features/notifications/hooks/useNotifications";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/notifications/hooks/useNotifications", () => ({
  useNotificationHistory: vi.fn(),
}));

vi.mock("../components/AdminSendNotificationModal", () => ({
  AdminSendNotificationModal: () => null,
}));

describe("NotificationHistoryPage", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
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

  const mockNotification = (id: string, title: string, type = "system_alert") => ({
    id,
    title,
    message: `Message for ${title}`,
    type,
    priority: "normal" as const,
    channel: "in_app" as const,
    status: "delivered" as const,
    inAppStatus: "unread" as const,
    recipientId: "cust-1",
    retryCount: 0,
    maxRetries: 3,
    createdAt: { seconds: 1720000000, nanoseconds: 0 } as any,
    sentAt: null,
    readAt: null,
    deliveredAt: null,
    expiresAt: null,
    relatedEntityType: null,
    relatedEntityId: null,
    metadata: {},
    createdBy: "system",
  });

  const renderComponent = () => {
    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <NotificationHistoryPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  };

  it("renders the page header, filter controls, and search bar", () => {
    vi.mocked(notificationHooks.useNotificationHistory).mockReturnValue({
      data: {
        notifications: [mockNotification("1", "Welcome to Paakashale")],
        lastDoc: null,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderComponent();

    expect(container?.textContent).toContain("Notification History");
    expect(container?.textContent).toContain("All Categories");
    expect(container?.textContent).toContain("All Statuses");
    expect(container?.textContent).toContain("Welcome to Paakashale");
  });

  it("renders empty state when no notifications match", () => {
    vi.mocked(notificationHooks.useNotificationHistory).mockReturnValue({
      data: {
        notifications: [],
        lastDoc: null,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderComponent();

    expect(container?.textContent).toContain("No notifications found");
  });

  it("displays pagination footer and disables Prev on Page 1", () => {
    vi.mocked(notificationHooks.useNotificationHistory).mockReturnValue({
      data: {
        notifications: [mockNotification("1", "First Notif")],
        lastDoc: { id: "doc-1" } as any,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderComponent();

    expect(container?.textContent).toContain("Page 1");
    expect(container?.textContent).toContain("Showing 1 notification on this page");

    const prevButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.includes("Prev"),
    );
    const nextButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.includes("Next"),
    );

    expect(prevButton).toBeDefined();
    expect(nextButton).toBeDefined();
    expect(prevButton?.hasAttribute("disabled")).toBe(true);
    expect(nextButton?.hasAttribute("disabled")).toBe(false);
  });

  it("navigates to next page when Next is clicked and lastDoc exists", async () => {
    const mockLastDoc = { id: "doc-page-1" } as any;

    vi.mocked(notificationHooks.useNotificationHistory).mockReturnValue({
      data: {
        notifications: [mockNotification("1", "Page 1 Item")],
        lastDoc: mockLastDoc,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderComponent();

    expect(container?.textContent).toContain("Page 1");

    const nextButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.includes("Next"),
    );

    await act(async () => {
      nextButton?.click();
    });

    // Verify useNotificationHistory was called with currentLastDoc = mockLastDoc
    expect(notificationHooks.useNotificationHistory).toHaveBeenLastCalledWith(
      expect.anything(),
      mockLastDoc,
      20,
    );
  });
});
