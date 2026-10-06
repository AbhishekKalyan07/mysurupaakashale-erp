import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogsPage } from "../AuditLogsPage";
import * as auditHooks from "../../hooks/useAuditLogs";
import * as auditRefHooks from "../../hooks/useAuditReferences";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../hooks/useAuditLogs", () => ({
  useAuditLogs: vi.fn(),
  useExportAuditLogs: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("../../hooks/useAuditReferences", () => ({
  useAuditReferences: vi.fn(),
}));

describe("AuditLogsPage - Friendly Reference Display Hardening", () => {
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

  const mockLog = (
    id: string,
    action: string,
    actorId = "raw_actor_uid_123",
    entityId = "raw_sub_uuid_456",
    details: any = {}
  ) => ({
    id,
    action,
    performedBy: actorId,
    performedByName: undefined,
    performedByRole: "customer",
    entityId,
    entityType: "subscription",
    timestamp: {
      toDate: () => new Date("2026-10-01T12:00:00Z"),
    } as any,
    details,
  });

  const renderComponent = () => {
    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuditLogsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it("renders friendly customer and subscription references instead of raw IDs in the normal view", () => {
    const rawCustomerId = "firebase_auth_uid_rahul_999";
    const rawSubId = "sub_uuid_45678_uuid_abcd";

    vi.mocked(auditHooks.useAuditLogs).mockReturnValue({
      data: {
        logs: [
          mockLog("log-1", "subscription_created", rawCustomerId, rawSubId, {
            customerId: rawCustomerId,
            subscriptionId: rawSubId,
          }),
        ],
        lastDoc: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.mocked(auditRefHooks.useAuditReferences).mockReturnValue({
      data: {
        [`user:${rawCustomerId}`]: "Rahul Kumar (MP-001)",
        [`customer:${rawCustomerId}`]: "Rahul Kumar (MP-001)",
        [`subscription:${rawSubId}`]: "Standard Plan (Monthly)",
      },
    } as any);

    renderComponent();

    // Verify page header
    expect(container?.textContent).toContain("Audit Logs");

    // Verify friendly Actor display
    expect(container?.textContent).toContain("Rahul Kumar (MP-001)");

    // Verify friendly Entity display
    expect(container?.textContent).toContain("Standard Plan (Monthly)");

    // Normal view must NOT render the raw Firebase Auth UID in the table cells
    // (Check main table content excluding <pre> raw JSON inspector)
    const tableHtml = container?.querySelector("table")?.innerHTML || "";
    const normalHtmlBeforePre = tableHtml.replace(/<pre[\s\S]*?<\/pre>/gi, "");

    expect(normalHtmlBeforePre).not.toContain(rawCustomerId);
    expect(normalHtmlBeforePre).not.toContain(rawSubId);

    // Verify raw technical IDs remain available in <pre> tag inside RawJsonInspector
    const preElement = container?.querySelector("pre");
    expect(preElement?.textContent).toContain(rawCustomerId);
    expect(preElement?.textContent).toContain(rawSubId);
  });

  it("filters logs by friendly customer name and MP display ID on the current page", () => {
    const user1Uid = "uid_cust_1";
    const user2Uid = "uid_cust_2";

    vi.mocked(auditHooks.useAuditLogs).mockReturnValue({
      data: {
        logs: [
          mockLog("log-1", "subscription_created", user1Uid, "sub-1", {
            customerId: user1Uid,
          }),
          mockLog("log-2", "payment_received", user2Uid, "sub-2", {
            customerId: user2Uid,
          }),
        ],
        lastDoc: null,
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.mocked(auditRefHooks.useAuditReferences).mockReturnValue({
      data: {
        [`user:${user1Uid}`]: "Rahul Kumar (MP-001)",
        [`customer:${user1Uid}`]: "Rahul Kumar (MP-001)",
        [`user:${user2Uid}`]: "Priya Sharma (MP-002)",
        [`customer:${user2Uid}`]: "Priya Sharma (MP-002)",
      },
    } as any);

    renderComponent();

    // Initially both rows are displayed
    expect(container?.textContent).toContain("Rahul Kumar (MP-001)");
    expect(container?.textContent).toContain("Priya Sharma (MP-002)");

    // Search by MP-001
    const searchInput = container?.querySelector("input[name='actorName']") as HTMLInputElement;
    expect(searchInput).toBeDefined();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(searchInput, "MP-001");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Only Rahul Kumar (MP-001) should remain
    expect(container?.textContent).toContain("Rahul Kumar (MP-001)");
    expect(container?.textContent).not.toContain("Priya Sharma (MP-002)");
  });
});
