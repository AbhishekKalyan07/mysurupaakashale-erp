import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useAuditLogs, useExportAuditLogs } from '../hooks/useAuditLogs';
import type { AuditLogFilter } from '@/shared/services/firestore/auditRepository';
import { ShieldAlert, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { APP_CONFIG } from '@/shared/config/appConfig';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { AuditLog } from '@/shared/types';

export function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogFilter>({});
  
  // Pagination state
  const [pageHistory, setPageHistory] = useState<QueryDocumentSnapshot<AuditLog>[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const currentLastDoc = currentPage > 0 ? pageHistory[currentPage - 1] : undefined;

  const { data, isLoading, isError } = useAuditLogs(filters, currentLastDoc);
  const exportMutation = useExportAuditLogs();

  const handleNextPage = () => {
    if (data?.lastDoc) {
      setPageHistory(prev => {
        const next = [...prev];
        next[currentPage] = data.lastDoc!;
        return next;
      });
      setCurrentPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage(p => Math.max(0, p - 1));
  };

  const handleExport = async () => {
    const csv = await exportMutation.mutateAsync(filters);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const next = { ...prev, [name]: value || undefined };
      // Clear pagination when filters change
      setPageHistory([]);
      setCurrentPage(0);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <ShieldAlert className="text-leaf-600" />
            Audit Logs
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Immutable operational and system logs.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport} isLoading={exportMutation.isPending}>
          <Download size={16} className="mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="p-4 bg-rice-25 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-ink-500 mb-1">Action</label>
          <input 
            type="text" 
            name="action"
            placeholder="e.g. business_settings_updated" 
            value={filters.action || ''}
            onChange={handleFilterChange}
            className="w-full h-10 px-3 border rounded-lg text-sm"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-ink-500 mb-1">Actor (UID)</label>
          <input 
            type="text" 
            name="userId"
            placeholder="Filter by user ID..." 
            value={filters.userId || ''}
            onChange={handleFilterChange}
            className="w-full h-10 px-3 border rounded-lg text-sm font-data"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-ink-500 mb-1">Start Date</label>
          <input 
            type="date" 
            name="startDate"
            value={filters.startDate || ''}
            onChange={handleFilterChange}
            className="w-full h-10 px-3 border rounded-lg text-sm"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-ink-500 mb-1">End Date</label>
          <input 
            type="date" 
            name="endDate"
            value={filters.endDate || ''}
            onChange={handleFilterChange}
            className="w-full h-10 px-3 border rounded-lg text-sm"
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12"><LoadingScreen /></div>
        ) : isError ? (
          <div className="p-8 text-danger">Failed to load audit logs.</div>
        ) : data?.logs.length === 0 ? (
          <div className="p-8"><EmptyState title="No Logs Found" description="Try adjusting your filters." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 text-ink-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor / Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rice-100">
                {data?.logs.map(log => (
                  <tr key={log.id} className="hover:bg-rice-25">
                    <td className="px-4 py-3 whitespace-nowrap text-ink-600 font-data text-xs">
                      {log.timestamp ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, {
                        dateStyle: 'medium',
                        timeStyle: 'medium'
                      }).format(log.timestamp.toDate()) : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral" className="font-data text-[10px] uppercase">{log.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {log.actorId && <div className="text-xs text-ink-700"><span className="text-ink-400">Actor:</span> {log.actorId}</div>}
                      {log.entityId && <div className="text-xs text-ink-700 mt-1"><span className="text-ink-400">Entity:</span> {log.entityId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <pre className="text-[10px] text-ink-600 max-w-sm overflow-x-auto bg-rice-50 p-2 rounded border border-rice-100">
                        {JSON.stringify(log.details || {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination Controls */}
        <div className="p-4 border-t border-rice-200 flex items-center justify-between bg-rice-25">
          <Button 
            variant="ghost" 
            onClick={handlePrevPage} 
            disabled={currentPage === 0 || isLoading}
          >
            <ChevronLeft size={16} className="mr-1" /> Prev
          </Button>
          <span className="text-xs text-ink-500 font-medium">Page {currentPage + 1}</span>
          <Button 
            variant="ghost" 
            onClick={handleNextPage} 
            disabled={!data?.lastDoc || isLoading}
          >
            Next <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
