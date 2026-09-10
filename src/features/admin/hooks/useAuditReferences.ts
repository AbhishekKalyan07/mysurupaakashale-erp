import { useQuery } from "@tanstack/react-query";
import type { AuditLog } from "@/shared/types/audit.types";
import { resolveAuditReferences } from "../utils/auditReferenceResolver";

export function useAuditReferences(logs: AuditLog[] | undefined) {
  return useQuery({
    queryKey: ["auditReferences", logs?.map((l) => l.id).join(",")],
    queryFn: async () => {
      if (!logs || logs.length === 0) return {};
      // Fetch references for current page of logs
      return resolveAuditReferences(logs);
    },
    enabled: !!logs && logs.length > 0,
    staleTime: 5 * 60_000, // cache for 5 minutes
  });
}
