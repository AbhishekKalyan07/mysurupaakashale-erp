import { useState } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useAuditLogs, useExportAuditLogs } from '../hooks/useAuditLogs';
import type { AuditLogFilter } from '@/shared/services/firestore/auditRepository';
import { ShieldAlert, Download, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
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
    <div className="space-y-8">
      <div className="relative">
        <PageHeader 
          userName="Audit Logs"
          subtitle="Immutable operational and system logs."
        />
        <div className="absolute top-6 right-6 hidden sm:block">
          <Button variant="secondary" onClick={handleExport} isLoading={exportMutation.isPending} className="shadow-sm font-bold bg-white/50 border-white/20 text-white hover:bg-white hover:text-primary">
            <Download size={18} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>
      
      <div className="sm:hidden flex justify-end">
        <Button variant="secondary" onClick={handleExport} isLoading={exportMutation.isPending} className="w-full shadow-sm font-bold border-primary/20 text-primary">
          <Download size={18} className="mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="p-5 border-primary/20 shadow-sm bg-primary/5">
        <div className="flex items-center gap-2 mb-4 text-primary font-bold text-sm uppercase tracking-wider">
          <Filter size={16} /> Filters
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Action</label>
            <input 
              type="text" 
              name="action"
              placeholder="e.g. business_settings_updated" 
              value={filters.action || ''}
              onChange={handleFilterChange}
              className="w-full h-11 px-4 border border-primary/20 bg-background rounded-xl text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Actor (UID)</label>
            <input 
              type="text" 
              name="userId"
              placeholder="Filter by user ID..." 
              value={filters.userId || ''}
              onChange={handleFilterChange}
              className="w-full h-11 px-4 border border-primary/20 bg-background rounded-xl text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Start Date</label>
            <input 
              type="date" 
              name="startDate"
              value={filters.startDate || ''}
              onChange={handleFilterChange}
              className="w-full h-11 px-4 border border-primary/20 bg-background rounded-xl text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">End Date</label>
            <input 
              type="date" 
              name="endDate"
              value={filters.endDate || ''}
              onChange={handleFilterChange}
              className="w-full h-11 px-4 border border-primary/20 bg-background rounded-xl text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
            />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden shadow-md border-primary/20">
        {isLoading ? (
          <div className="p-12"><div className="p-8"><TableSkeleton /></div></div>
        ) : isError ? (
          <div className="p-8 text-red-500 font-bold">Failed to load audit logs.</div>
        ) : data?.logs.length === 0 ? (
          <div className="p-8"><EmptyState title="No Logs Found" description="Try adjusting your filters." icon={<ShieldAlert size={48} className="text-primary/40" />} /></div>
        ) : (
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left text-sm block md:table font-sans">
              <thead className="hidden md:table-header-group bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                <tr>
                  <th className="px-6 py-4 min-w-[160px]">Timestamp</th>
                  <th className="px-6 py-4 min-w-[200px]">Action</th>
                  <th className="px-6 py-4 min-w-[150px]">Actor / Entity</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-primary/5 bg-background">
                {data?.logs.map(log => (
                  <tr key={log.id} className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 p-4 md:p-0 space-y-3 md:space-y-0 transition-colors">
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 whitespace-nowrap text-text-muted font-medium font-sans text-xs">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Timestamp</span>
                      <span className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block text-primary">
                        {log.timestamp ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, {
                          dateStyle: 'medium',
                          timeStyle: 'medium'
                        }).format(log.timestamp.toDate()) : 'N/A'}
                      </span>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Action</span>
                      <Badge variant="default" className="font-mono text-[10px] font-bold tracking-wider">{log.action}</Badge>
                    </td>
                    <td className="flex justify-between items-start md:items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-right md:text-left">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider mt-0.5">Actor/Entity</span>
                      <div>
                        {log.performedBy && <div className="text-[10px] font-mono text-primary bg-background-alt px-1.5 py-0.5 rounded border border-primary/5 inline-block mb-1 break-all max-w-[200px]"><span className="text-text-muted font-sans font-bold uppercase tracking-wider text-[8px]">Actor: </span> {log.performedBy}</div>}
                        {log.entityId && <div className="text-[10px] font-mono text-primary bg-background-alt px-1.5 py-0.5 rounded border border-primary/5 inline-block break-all max-w-[200px]"><span className="text-text-muted font-sans font-bold uppercase tracking-wider text-[8px]">Entity: </span> {log.entityId}</div>}
                      </div>
                    </td>
                    <td className="block md:table-cell px-0 md:px-6 py-2 md:py-4 max-w-[300px]">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider block mb-1">Details</span>
                      <pre className="text-[10px] text-text-muted w-full overflow-x-auto bg-background-alt p-3 rounded-lg border border-primary/10 whitespace-pre-wrap word-break shadow-inner font-medium">
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
        <div className="px-6 py-4 border-t border-primary/10 bg-primary/5 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handlePrevPage} 
            disabled={currentPage === 0 || isLoading}
            className="font-bold text-primary hover:text-gold hover:bg-gold/10"
          >
            <ChevronLeft size={16} className="mr-1" /> Prev
          </Button>
          <span className="text-primary font-bold font-data text-xs bg-background px-3 py-1.5 rounded-lg border border-primary/10 shadow-sm">Page {currentPage + 1}</span>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleNextPage} 
            disabled={!data?.lastDoc || isLoading}
            className="font-bold text-primary hover:text-gold hover:bg-gold/10"
          >
            Next <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
