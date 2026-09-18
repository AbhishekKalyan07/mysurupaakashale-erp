import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSendNotificationModal } from "../AdminSendNotificationModal";
import * as notificationService from "@/shared/services/firestore/notificationService";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { toast } from "react-hot-toast";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/services/firestore/notificationService", () => ({
  sendAdminBroadcastNotification: vi.fn(),
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    list: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AdminSendNotificationModal", () => {
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

    vi.mocked(notificationService.sendAdminBroadcastNotification).mockResolvedValue({
      success: true,
      recipientCount: 5,
    });

    vi.mocked(userRepository.list).mockResolvedValue([
      {
        id: "user-1",
        fullName: "Aarav Sharma",
        phone: "+919876543210",
        email: "aarav@example.com",
        role: "customer",
        isActive: true,
      } as any,
      {
        id: "user-2",
        fullName: "Priya Rao",
        phone: "+919876543211",
        email: "priya@example.com",
        role: "delivery_partner",
        isActive: true,
      } as any,
    ]);
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

  const renderModal = (isOpen = true, onClose = vi.fn()) => {
    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <AdminSendNotificationModal isOpen={isOpen} onClose={onClose} />
        </QueryClientProvider>,
      );
    });
  };

  it("does not render when isOpen is false", () => {
    renderModal(false);
    expect(container?.textContent).not.toContain("Compose & Send Notification");
  });

  it("renders when isOpen is true with audience options", () => {
    renderModal(true);
    expect(container?.textContent).toContain("Compose & Send Notification");
    expect(container?.textContent).toContain("All Customers");
    expect(container?.textContent).toContain("Delivery Partners");
    expect(container?.textContent).toContain("Kitchen Staff");
    expect(container?.textContent).toContain("Specific User");
  });

  it("loads and displays users when Specific User is chosen", async () => {
    renderModal(true);

    const specificUserBtn = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent?.includes("Specific User"));

    expect(specificUserBtn).toBeDefined();

    await act(async () => {
      specificUserBtn?.click();
    });

    expect(userRepository.list).toHaveBeenCalled();
    expect(container?.textContent).toContain("Select Recipient");
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    renderModal(true, onClose);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("validates empty title and message before sending", async () => {
    renderModal(true);

    const form = container?.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(toast.error).toHaveBeenCalledWith("Please enter a notification title");
    expect(notificationService.sendAdminBroadcastNotification).not.toHaveBeenCalled();
  });

  it("successfully submits notification and closes modal", async () => {
    const onClose = vi.fn();
    renderModal(true, onClose);

    const titleInput = container?.querySelector(
      'input[placeholder="e.g. Special Festival Feast Today!"]',
    ) as HTMLInputElement;
    const messageTextarea = container?.querySelector("textarea") as HTMLTextAreaElement;

    expect(titleInput).toBeDefined();
    expect(messageTextarea).toBeDefined();

    const setNativeValue = (
      element: HTMLInputElement | HTMLTextAreaElement,
      value: string,
    ) => {
      const prototype =
        element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    act(() => {
      if (titleInput) setNativeValue(titleInput, "Test Announcement");
      if (messageTextarea) {
        setNativeValue(messageTextarea, "This is a test notification message for everyone.");
      }
    });

    const form = container?.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(notificationService.sendAdminBroadcastNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Test Announcement",
        message: "This is a test notification message for everyone.",
        targetAudience: "customer",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Notification sent successfully"),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
