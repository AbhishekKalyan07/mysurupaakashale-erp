import { useQuery, useMutation } from '@tanstack/react-query';
import { auditRepository, type AuditLogFilter } from '@/shared/services/firestore/auditRepository';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { AuditLog } from '@/shared/types';

export function useAuditLogs(filters: AuditLogFilter, pageParam?: QueryDocumentSnapshot<AuditLog>) {
  return useQuery({
    queryKey: ['auditLogs', filters, pageParam?.id],
    queryFn: () => auditRepository.getAuditLogs(filters, 20, pageParam),
    staleTime: 60000,
  });
}

export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async (filters: AuditLogFilter) => {
      // Phase 7: Client-side CSV generation instead of Cloud Function
      let allLogs: AuditLog[] = [];
      let pageParam: QueryDocumentSnapshot<AuditLog> | undefined = undefined;
      
      // Fetch all logs iteratively (up to a reasonable limit for client side)
      for (let i = 0; i < 50; i++) {
        const { logs, lastDoc } = await auditRepository.getAuditLogs(filters, 100, pageParam);
        allLogs = allLogs.concat(logs);
        if (!lastDoc || logs.length < 100) break;
        pageParam = lastDoc;
      }
      
      if (allLogs.length === 0) return "No data";
      
      const header = ["Timestamp", "Action", "Actor", "Details"].join(",");
      const rows = allLogs.map(log => {
        const date = log.timestamp ? new Date(log.timestamp.seconds * 1000).toISOString() : '';
        return `"${date}","${log.action}","${log.actorId}","${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`;
      });
      
      return [header, ...rows].join("\n");
    }
  });
}
