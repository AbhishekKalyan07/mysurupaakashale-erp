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
      } as unknown as AuditLog,
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
      } as unknown as AuditLog,
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
      } as unknown as AuditLog,
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
      } as unknown as AuditLog,
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
      } as unknown as AuditLog,
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
      } as unknown as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    expect(resolved["menu:menu1"]).toBe("Menu for 2023-10-01");
  });

  it("formats remaining entity types correctly", async () => {
    // We will simulate a fetch that returns one of each remaining type
    mockGetDocs.mockImplementation((_q: any) => {
      // Mock returns depending on collection passed to query
      return Promise.resolve({
        forEach: (cb: any) => {
          cb({ id: "inv1", data: () => ({ billingMonth: "2023-09", amount: 100 }) });
          cb({ id: "sub1", data: () => ({}) });
          cb({ id: "adv1", data: () => ({}) });
          cb({ id: "prof1", data: () => ({}) });
          cb({ id: "pay1", data: () => ({ staffName: "John", month: "2023-09" }) });
          cb({ id: "zone1", data: () => ({ name: "North" }) });
          cb({ id: "del1", data: () => ({ zoneName: "North", date: "2023-10-01" }) });
          cb({ id: "leave1", data: () => ({ staffName: "Jane" }) });
        }
      });
    });

    const logs = [
      { id: "log1", performedByName: "Admin", entityId: "inv1", entityType: "invoice" } as unknown as AuditLog,
      { id: "log2", performedByName: "Admin", entityId: "sub1", entityType: "subscription" } as unknown as AuditLog,
      { id: "log3", performedByName: "Admin", entityId: "adv1", entityType: "salary_advance" } as unknown as AuditLog,
      { id: "log4", performedByName: "Admin", entityId: "prof1", entityType: "salary_profile" } as unknown as AuditLog,
      { id: "log5", performedByName: "Admin", entityId: "pay1", entityType: "payroll" } as unknown as AuditLog,
      { id: "log6", performedByName: "Admin", entityId: "zone1", entityType: "zone" } as unknown as AuditLog,
      { id: "log7", performedByName: "Admin", entityId: "del1", entityType: "route" } as unknown as AuditLog,
      { id: "log8", performedByName: "Admin", entityId: "leave1", entityType: "leave" } as unknown as AuditLog,
    ];

    const resolved = await resolveAuditReferences(logs);
    
    expect(resolved["invoice:inv1"]).toBe("Invoice (2023-09 - ₹100)");
    expect(resolved["subscription:sub1"]).toBe("Subscription");
    expect(resolved["salary_advance:adv1"]).toBe("Salary Advance");
    expect(resolved["salary_profile:prof1"]).toBe("Salary Profile");
    expect(resolved["payroll:pay1"]).toBe("Payroll for John (2023-09)");
    expect(resolved["zone:zone1"]).toBe("Zone: North");
    expect(resolved["route:del1"]).toBe("Route for North (2023-10-01)");
    expect(resolved["leave:leave1"]).toBe("Leave for Jane");
  });
});
