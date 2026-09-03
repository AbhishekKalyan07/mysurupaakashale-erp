import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarX,
  CalendarCheck,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Info,
} from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { holidayRepository } from '@/shared/services/firestore/holidayRepository';
import { getTodayInTimezone } from '@/shared/lib/date';
import type { Holiday } from '@/shared/types';
import toast from 'react-hot-toast';
import { cn } from '@/shared/lib/cn';
import { auth } from '@/shared/lib/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isFutureOrToday(dateStr: string): boolean {
  const today = getTodayInTimezone();
  return dateStr >= today;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function HolidayStatusBadge({ status }: { status: Holiday['status'] }) {
  return status === 'active' ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      <XCircle className="w-3 h-3" />
      Cancelled
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Holiday List Table
// ─────────────────────────────────────────────────────────────────────────────

function HolidayTable({
  holidays,
  onCancel,
  isCancelling,
}: {
  holidays: Holiday[];
  onCancel: (date: string) => void;
  isCancelling: string | null;
}) {
  const today = getTodayInTimezone();

  if (holidays.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-base">No holidays declared yet.</p>
        <p className="text-sm mt-1">Use the form above to declare one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th className="text-left py-3 px-4 text-text-muted font-medium">Date</th>
            <th className="text-left py-3 px-4 text-text-muted font-medium">Name</th>
            <th className="text-left py-3 px-4 text-text-muted font-medium hidden md:table-cell">Description</th>
            <th className="text-left py-3 px-4 text-text-muted font-medium">Status</th>
            <th className="text-left py-3 px-4 text-text-muted font-medium hidden lg:table-cell">Declared By</th>
            <th className="text-right py-3 px-4 text-text-muted font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holidays.map((h) => {
            const isFuture = h.date >= today;
            const isActiveAndFuture = h.status === 'active' && isFuture;
            const cancelling = isCancelling === h.date;

            return (
              <tr
                key={h.id}
                className={cn(
                  'border-b border-border/30 transition-colors hover:bg-surface-1/50',
                  h.status === 'cancelled' && 'opacity-60',
                )}
              >
                <td className="py-3 px-4">
                  <div className="font-medium text-text">{formatDate(h.date)}</div>
                  <div className="text-xs text-text-muted font-mono">{h.date}</div>
                </td>
                <td className="py-3 px-4 font-medium text-text">{h.name}</td>
                <td className="py-3 px-4 text-text-muted hidden md:table-cell">
                  {h.description || <span className="text-xs italic opacity-50">—</span>}
                </td>
                <td className="py-3 px-4">
                  <HolidayStatusBadge status={h.status} />
                </td>
                <td className="py-3 px-4 text-text-muted hidden lg:table-cell font-mono text-xs">
                  {h.createdBy}
                </td>
                <td className="py-3 px-4 text-right">
                  {isActiveAndFuture && (
                    <Button
                      id={`cancel-holiday-${h.date}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => onCancel(h.date)}
                      disabled={cancelling}
                      className="text-danger hover:text-danger hover:bg-danger/10 text-xs gap-1"
                    >
                      {cancelling ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      Cancel Holiday
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminHolidayPage() {
  const queryClient = useQueryClient();
  const today = getTodayInTimezone();

  // Form state
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'form' | 'preview' | 'confirming'>('form');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cancellingDate, setCancellingDate] = useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const {
    data: holidays = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Holiday[]>({
    queryKey: ['admin', 'holidays'],
    queryFn: () => holidayRepository.listHolidays(),
    staleTime: 60_000,
  });

  // ── Derived metrics ────────────────────────────────────────────────────────
  const activeCount = holidays.filter((h) => h.status === 'active').length;
  const upcomingActive = holidays.filter(
    (h) => h.status === 'active' && h.date >= today,
  ).length;

  // ── Validation ────────────────────────────────────────────────────────────
  const dateError = (() => {
    if (!date) return null;
    if (!isValidISODate(date)) return 'Date must be in YYYY-MM-DD format.';
    if (!isFutureOrToday(date)) return 'Cannot declare a holiday for a past date.';
    const existing = holidays.find((h) => h.date === date);
    if (existing?.status === 'active') return `An active holiday already exists for ${date}.`;
    return null;
  })();

  const isFormValid = date && !dateError && name.trim().length > 0;

  // ── Preview ────────────────────────────────────────────────────────────────
  const handlePreview = useCallback(async () => {
    if (!isFormValid) return;
    setPreviewLoading(true);
    try {
      const count = await holidayRepository.previewAffectedOrders(date);
      setPreviewCount(count);
      setStep('preview');
    } catch (err) {
      toast.error('Failed to preview affected orders. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }, [date, isFormValid]);

  // ── Declare holiday mutation ───────────────────────────────────────────────
  const declareMutation = useMutation({
    mutationFn: async () => {
      const createdBy = auth.currentUser?.uid ?? 'unknown';
      return holidayRepository.createOrGetHoliday({
        date,
        name: name.trim(),
        description: description.trim() || undefined,
        createdBy,
      });
    },
    onSuccess: ({ holiday }) => {
      toast.success(
        `Holiday declared for ${holiday.date}. Eligible orders are being cancelled in the background.`,
        { duration: 5000 },
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'holidays'] });
      // Reset form
      setDate('');
      setName('');
      setDescription('');
      setStep('form');
      setPreviewCount(null);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to declare holiday. Please try again.');
      setStep('form');
    },
  });

  // ── Cancel holiday mutation ────────────────────────────────────────────────
  const cancelHolidayMutation = useMutation({
    mutationFn: async (holidayDate: string) => {
      setCancellingDate(holidayDate);
      await holidayRepository.cancelHoliday(holidayDate, auth.currentUser?.uid ?? 'unknown');
    },
    onSuccess: () => {
      toast.success('Holiday has been cancelled. No orders will be automatically restored.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'holidays'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to cancel holiday.');
    },
    onSettled: () => {
      setCancellingDate(null);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Holiday Management"
        subtitle="Declare holidays to block order generation and notify all users."
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            title="Total Holidays"
            value={isLoading ? '…' : String(holidays.length)}
            icon={<CalendarX className="w-5 h-5" />}
          />
          <MetricCard
            title="Active Holidays"
            value={isLoading ? '…' : String(activeCount)}
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <MetricCard
            title="Upcoming Active"
            value={isLoading ? '…' : String(upcomingActive)}
            icon={<CalendarCheck className="w-5 h-5" />}
          />
        </div>

        {/* ── Declare Holiday Form ─────────────────────────────────────────── */}
        <Card elevated className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Declare a Holiday</h2>
              <p className="text-sm text-text-muted">No orders will be generated and all eligible existing orders will be cancelled.</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex gap-3 p-3 rounded-xl bg-info-subtle border border-info/20 mb-6">
            <Info className="w-4 h-4 text-info mt-0.5 shrink-0" />
            <p className="text-sm text-info">
              <strong>Important:</strong> Declaring a holiday will cancel all eligible (scheduled, preparing, packing)
              orders for that date and notify all users. Previously cancelled orders will <strong>not</strong> be
              restored if the holiday is later withdrawn.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Date picker */}
            <div>
              <label htmlFor="holiday-date" className="block text-sm font-medium text-text mb-1.5">
                Holiday Date <span className="text-danger">*</span>
              </label>
              <Input
                id="holiday-date"
                type="date"
                value={date}
                min={today}
                onChange={(e) => {
                  setDate(e.target.value);
                  setStep('form');
                  setPreviewCount(null);
                }}
                disabled={declareMutation.isPending}
                className={cn(dateError && 'border-danger focus:ring-danger/30')}
              />
              {dateError && (
                <p className="mt-1 text-xs text-danger flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {dateError}
                </p>
              )}
            </div>

            {/* Holiday name */}
            <div>
              <label htmlFor="holiday-name" className="block text-sm font-medium text-text mb-1.5">
                Holiday Name <span className="text-danger">*</span>
              </label>
              <Input
                id="holiday-name"
                type="text"
                placeholder="e.g. Diwali, Independence Day"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setStep('form');
                  setPreviewCount(null);
                }}
                disabled={declareMutation.isPending}
                maxLength={100}
              />
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label htmlFor="holiday-description" className="block text-sm font-medium text-text mb-1.5">
              Description <span className="text-text-muted text-xs">(optional)</span>
            </label>
            <textarea
              id="holiday-description"
              rows={2}
              placeholder="Additional context for staff and customers…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={declareMutation.isPending}
              maxLength={500}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none text-text placeholder:text-text-muted/50 disabled:opacity-60"
            />
          </div>

          {/* Preview Panel */}
          {step === 'preview' && previewCount !== null && (
            <div
              id="holiday-preview-panel"
              className={cn(
                'mb-6 p-4 rounded-xl border-2 transition-all',
                previewCount > 0
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300',
              )}
            >
              <div className="flex items-start gap-3">
                <Eye className={cn('w-5 h-5 mt-0.5', previewCount > 0 ? 'text-amber-600' : 'text-emerald-600')} />
                <div>
                  <p className={cn('font-semibold', previewCount > 0 ? 'text-amber-800' : 'text-emerald-800')}>
                    Preview: {previewCount} existing order{previewCount !== 1 ? 's' : ''} will be cancelled
                  </p>
                  <p className={cn('text-sm mt-0.5', previewCount > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                    {previewCount > 0
                      ? `These orders have status: scheduled, preparing, or packing. They will be cancelled with reason 'holiday'.`
                      : `No eligible orders exist for ${date}. Declaring the holiday will only block future order generation.`}
                  </p>
                  <p className="text-xs mt-1 text-text-muted italic">
                    Note: The final count is recalculated at confirmation time. This is informational only.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {step === 'form' && (
              <Button
                id="preview-holiday-btn"
                variant="tonal"
                onClick={handlePreview}
                disabled={!isFormValid || previewLoading}
                className="gap-2"
              >
                {previewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview Affected Orders
              </Button>
            )}

            {step === 'preview' && (
              <>
                <Button
                  id="confirm-declare-holiday-btn"
                  onClick={() => declareMutation.mutate()}
                  disabled={declareMutation.isPending}
                  className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
                >
                  {declareMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CalendarX className="w-4 h-4" />
                  )}
                  Confirm & Declare Holiday
                </Button>
                <Button
                  id="back-to-form-btn"
                  variant="ghost"
                  onClick={() => { setStep('form'); setPreviewCount(null); }}
                  disabled={declareMutation.isPending}
                >
                  Back
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* ── Holiday List ─────────────────────────────────────────────────── */}
        <Card elevated className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Holiday Calendar</h2>
              <p className="text-sm text-text-muted">All declared holidays — upcoming and past.</p>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 text-text-muted gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading holidays…
            </div>
          )}

          {isError && (
            <ErrorState
              title="Failed to load holidays"
              description={(error as Error)?.message}
              onRetry={() => refetch()}
            />
          )}

          {!isLoading && !isError && (
            <HolidayTable
              holidays={holidays}
              onCancel={(d) => cancelHolidayMutation.mutate(d)}
              isCancelling={cancellingDate}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
