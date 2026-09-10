import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAuditReferences } from "../../utils/auditReferenceResolver";
import type { AuditLog } from "@/shared/types/audit.types";

// Mock Firestore
vi.mock("firebase/firestore", () => {
  return {
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    documentId: vi.fn(() => "__name__"),
    getDocs: vi.fn(),
    initializeFirestore: vi.fn(),
    getFirestore: vi.fn(),
    memoryLocalCache: vi.fn(),
    persistentSingleTabManager: vi.fn(),
    setLogLevel: vi.fn(),
    connectFirestoreEmulator: vi.fn(),
  };
});

import { getDocs } from "firebase/firestore";

describe("auditReferenceResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGetDocs = getDocs as any;

  it("handles new audit record with performedByName natively without lookup", async () => {
    const logs = [
      {
        id: "log1",
        performedBy: "uid123",
        performedByName: "John Doe",
        entityId: "ent1",
        entityType: "system",
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    
    // Doesn't attempt to resolve user because performedByName is present
    expect(mockGetDocs).not.toHaveBeenCalled();
    // System entity type resolves locally without fetch
    expect(resolved["system:ent1"]).toBe("System");
  });

  it("resolves legacy actor UID to fullName", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb: any) => cb({
        id: "uid123",
        data: () => ({ fullName: "Jane Smith", displayId: "CUST-1" })
      })
    });

    const logs = [
      {
        id: "log1",
        performedBy: "uid123",
        entityId: "settings1",
        entityType: "settings",
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(resolved["user:uid123"]).toBe("Jane Smith (CUST-1)");
    expect(resolved["settings:settings1"]).toBe("Settings (settings1)");
  });

  it("resolves deleted actor as Unknown user", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (_cb: any) => {} // Returns empty docs
    });

    const logs = [
      {
        id: "log1",
        performedBy: "deleted_uid",
        entityId: "ent1",
        entityType: "system",
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["user:deleted_uid"]).toBeUndefined();
    // When used in UI, `references?.['user:deleted_uid'] || "Unknown user"` will handle it
  });

  it("resolves attendance using details.staffId", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb: any) => cb({
        id: "staff123",
        data: () => ({ fullName: "Staff Member", displayId: "STAFF-1" })
      })
    });

    const logs = [
      {
        id: "log1",
        performedBy: "uid1",
        performedByName: "Admin", // Skip actor resolution
        entityId: "att1",
        entityType: "attendance",
        details: { staffId: "staff123" }
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["attendance:att1"]).toBe("Attendance for Staff Member (STAFF-1)");
  });

  it("resolves orders to include displayId or customerName", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb: any) => cb({
        id: "ord1",
        data: () => ({ displayId: "ORD-999" })
      })
    });

    const logs = [
      {
        id: "log1",
        performedBy: "uid1",
        performedByName: "Admin",
        entityId: "ord1",
        entityType: "order",
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["order:ord1"]).toBe("Order ORD-999");
  });

  it("resolves payment to include customerName", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb: any) => cb({
        id: "pay1",
        data: () => ({ customerName: "Alice" })
      })
    });

    const logs = [
      {
        id: "log1",
        performedByName: "Admin",
        entityId: "pay1",
        entityType: "payment",
      } as unknown as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["payment:pay1"]).toBe("Payment from Alice");
  });

  it("handles missing/permission-denied entity as Unknown entity natively", async () => {
    mockGetDocs.mockRejectedValueOnce(new Error("Permission denied"));

    const logs = [
      {
        id: "log1",
        performedByName: "Admin",
        entityId: "ord_missing",
        entityType: "order",
      } as unknown as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    // Should swallow error and leave undefined
    expect(resolved["order:ord_missing"]).toBeUndefined();
  });

  it("prevents ID collision between different entityTypes", async () => {
    // If a user and an order have the exact same UUID
    const sameUUID = "same-uuid-123";
    
    mockGetDocs.mockImplementation((_q: any) => {
      // Mock returns depending on collection passed to query
      // (Using a generic mock here)
      return Promise.resolve({
        forEach: (cb: any) => {
           cb({
             id: sameUUID,
             data: () => ({ fullName: "User Same" }) // Just stub something
           })
        }
      });
    });

    const logs = [
      {
        id: "log1",
        performedBy: sameUUID,
        entityId: sameUUID,
        entityType: "order",
      } as unknown as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    
    // We expect user:same-uuid-123 and order:same-uuid-123 to be populated, 
    // potentially with different display strings depending on how formatResolvedEntity processes the generic data.
    // In a real mock we'd inspect the collection, but here we just prove keys don't overwrite each other.
    expect(resolved[`user:${sameUUID}`]).toBeDefined();
    expect(resolved[`order:${sameUUID}`]).toBeDefined();
  });

  it("resolves menu using dailyMenus collection", async () => {
    mockGetDocs.mockImplementation((_q: any) => {
      // The mock collection function captures the path, but since we are mocking getDocs here
      // we just simulate returning a menu. We can verify the formatting works.
      return Promise.resolve({
        forEach: (cb: any) => cb({
          id: "menu1",
          data: () => ({ date: "2023-10-01" })
        })
      });
    });

    const logs = [
      {
        id: "log1",
        performedBy: "uid1",
        performedByName: "Admin",
        entityId: "menu1",
        entityType: "menu",
      } as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["menu:menu1"]).toBe("Menu for 2023-10-01");
  });
});
