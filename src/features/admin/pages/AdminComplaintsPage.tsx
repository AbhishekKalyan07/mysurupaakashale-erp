import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, CheckCircle, Loader2 } from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { BaseRepository, createConverter } from '@/shared/services/firestore/BaseRepository';
import { db } from '@/shared/lib/firebase';
import type { Feedback, FeedbackStatus } from '@/shared/types/feedback.types';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/shared/hooks/useReferenceData';

const feedbackRepo = new BaseRepository<Feedback>(db, 'feedback', createConverter<Feedback>());

export function AdminComplaintsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('all');

  const { data: complaints = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'complaints'],
    queryFn: () => feedbackRepo.list(),
  });

  const { customerMap } = useReferenceData(complaints.map(c => c.customerId));

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string, status: FeedbackStatus, notes?: string }) => {
      await feedbackRepo.update(id, { status, resolutionNotes: notes || '' });
    },
    onSuccess: () => {
      toast.success('Complaint updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'complaints'] });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update complaint');
    }
  });

  if (error) {
    return <ErrorState title="Failed to load complaints" onRetry={() => queryClient.invalidateQueries({ queryKey: ['admin', 'complaints'] })} />;
  }

  const filteredComplaints = complaints.filter(c => filter === 'all' ? true : c.status === filter).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

  return (
    <div className="space-y-8">
      <PageHeader 
        userName="Complaints Management"
        subtitle="Dashboard / Complaints"
      />

      <Card className="p-5">
        <div className="flex gap-4 items-center">
          <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Filter Status:</label>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value as FeedbackStatus | 'all')}
            className="rounded-xl border border-primary/20 bg-background px-4 py-2 text-sm font-sans shadow-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold text-primary font-medium"
          >
            <option value="all">All Complaints</option>
            <option value="new">New</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-primary/5">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-primary/5 py-16 text-center">
          <MessageSquare className="mb-4 h-12 w-12 text-primary/40" />
          <h3 className="text-lg font-display font-bold text-primary">No Complaints Found</h3>
          <p className="mt-1 text-sm font-sans text-text-muted">
            There are no complaints matching the current filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredComplaints.map(complaint => (
            <Card key={complaint.id} className="p-6">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary/50 bg-primary/5 px-2 py-1 rounded">
                      {complaint.category.replace('_', ' ')}
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${
                      complaint.status === 'new' ? 'bg-red-100 text-red-700' :
                      complaint.status === 'investigating' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {complaint.status}
                    </span>
                    <span className="text-xs text-text-muted">
                      {complaint.createdAt.toDate().toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="font-bold text-primary text-lg">{complaint.message}</h4>
                  <div className="text-sm text-text-muted mt-1">Customer: {customerMap.get(complaint.customerId) || complaint.customerId}</div>
                  {complaint.orderId && <div className="text-sm text-text-muted">Order ID: {complaint.orderId}</div>}
                  {complaint.resolutionNotes && (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
                      <strong>Resolution Notes:</strong> {complaint.resolutionNotes}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2 min-w-[200px]">
                  {complaint.status !== 'resolved' && (
                    <select
                      value={complaint.status}
                      onChange={(e) => updateStatusMutation.mutate({ 
                        id: complaint.id, 
                        status: e.target.value as FeedbackStatus,
                        notes: e.target.value === 'resolved' ? prompt('Enter resolution notes (optional):') || '' : ''
                      })}
                      disabled={updateStatusMutation.isPending}
                      className="text-sm rounded-lg border border-primary/20 bg-background py-2 px-3 shadow-sm focus:border-gold focus:ring-1 focus:ring-gold text-primary font-bold cursor-pointer hover:border-gold/50"
                    >
                      <option value="new">Mark as New</option>
                      <option value="investigating">Mark as Investigating</option>
                      <option value="resolved">Mark as Resolved</option>
                    </select>
                  )}
                  {complaint.status === 'resolved' && (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold justify-end">
                      <CheckCircle size={20} /> Resolved
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
