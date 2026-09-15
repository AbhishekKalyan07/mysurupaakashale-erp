import { useQuery, useMutation } from "@tanstack/react-query";
import {
  auditRepository,
  type AuditLogFilter,
} from "@/shared/services/firestore/auditRepository";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { AuditLog } from "@/shared/types";
import { sanitizeSpreadsheetValue } from "@/shared/utils/spreadsheet";

export function useAuditLogs(
  filters: AuditLogFilter,
  pageParam?: QueryDocumentSnapshot<AuditLog>,
) {
  return useQuery({
    queryKey: ["auditLogs", filters, pageParam?.id],
    queryFn: () => auditRepository.getAuditLogs(filters, 20, pageParam),
    staleTime: 60000,
  });
}

export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async (filters: AuditLogFilter) => {
      // Phase 7: Client-side CSV generation instead of Cloud Function

      // Fetch up to 5000 logs in a single query rather than paginating sequentially
      // This massively reduces network round-trips for the export function.
      const { logs: allLogs } = await auditRepository.getAuditLogs(
        filters,
        5000,
      );

      if (allLogs.length === 0) return "No data";

      // Dynamically import the resolver to avoid circular/initialization issues if any
      const { resolveAuditReferences } = await import("../utils/auditReferenceResolver");
      const resolvedRefs = await resolveAuditReferences(allLogs);

      const header = [
        "Timestamp",
        "Action",
        "Actor Name",
        "Actor Role",
        "Entity Type",
        "Entity ID",
        "Details",
      ].join(",");
      const rows = allLogs.map((log) => {
        const date = log.timestamp
          ? new Date(log.timestamp.seconds * 1000).toISOString()
          : "";

        let actorDisplay = log.performedByName;
        if (!actorDisplay) {
           actorDisplay = resolvedRefs[`user:${log.performedBy}`] || log.performedByRole || "Unknown user";
        }

        const roleDisplay = log.performedByRole || "";

        let entityDisplay = "";
        if (log.entityId) {
           entityDisplay = resolvedRefs[`${log.entityType}:${log.entityId}`] || "Unknown entity";
        }
        
        const safeActor = sanitizeSpreadsheetValue(actorDisplay);
        const safeEntity = sanitizeSpreadsheetValue(entityDisplay);
        
        const csvActor = `"${String(safeActor).replace(/"/g, '""')}"`;
        const csvEntity = `"${String(safeEntity).replace(/"/g, '""')}"`;

        return `"${date}","${log.action}",${csvActor},"${roleDisplay}","${log.entityType || ""}",${csvEntity},"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`;
      });

      return [header, ...rows].join("\n");
    },
  });
}
