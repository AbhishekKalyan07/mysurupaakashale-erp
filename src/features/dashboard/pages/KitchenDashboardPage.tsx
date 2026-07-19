import {
  ChefHat,
  Utensils,
  Sun,
  Clock,
  Moon,
  CheckCircle2,
  MapPin,
  RefreshCw,
  TrendingUp,
  ClipboardList,
} from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import {
  useKitchenDashboard,
  getTodayIST,
  type MealTypeSummary,
} from '@/features/kitchen/hooks/useKitchenDashboard';
import type { MealType } from '@/shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// KitchenDashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export function KitchenDashboardPage() {
  const today = getTodayIST();
  const { dashboard, isLoading, isError, error, refetch, isFetching } =
    useKitchenDashboard(today);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <ErrorState
        title="Could not load kitchen data"
        description={
          error instanceof Error
            ? error.message
            : 'Failed to fetch today\'s orders. Check your connection and try again.'
        }
        onRetry={refetch}
      />
    );
  }

  // ── Empty (no orders generated yet) ───────────────────────────────────────
  if (!dashboard || dashboard.totalOrders === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <PageHeader today={today} isFetching={isFetching} onRefresh={refetch} />
        <EmptyState
          icon={<ChefHat size={40} className="text-leaf-300" />}
          title="No orders for today yet"
          description={
            `Daily order generation runs at 02:00 AM IST. ` +
            `Orders for ${formatDisplayDate(today)} will appear here automatically.`
          }
        />
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const { byMealType, byStatus, completedCount, progressPercent, byZone, totalOrders } =
    dashboard;

  const scheduledCount   = byStatus.scheduled        ?? 0;
  const preparingCount   = byStatus.preparing         ?? 0;
  const readyCount       = byStatus.ready_for_pickup  ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader today={today} isFetching={isFetching} onRefresh={refetch} />

      {/* ── Production Progress Bar ─────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-leaf-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">
              Production Progress
            </h2>
          </div>
          <span
            className="font-data text-sm font-semibold text-leaf-700"
            aria-label={`${progressPercent} percent complete`}
          >
            {progressPercent}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Kitchen production progress"
          className="w-full h-3 bg-rice-200 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-leaf-600 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-ink-500 font-sans">
          {completedCount} of {totalOrders} orders completed
        </p>
      </Card>

      {/* ── Status KPI Row ──────────────────────────────────────────────── */}
      <section aria-label="Kitchen status overview">
        <h2 className="sr-only">Current Kitchen Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatusKpiCard
            id="kpi-total"
            label="Total Meals"
            value={totalOrders}
            icon={<ClipboardList size={20} />}
            colorClass="text-ink-700 bg-rice-100"
          />
          <StatusKpiCard
            id="kpi-preparing"
            label="Preparing"
            value={preparingCount}
            icon={<ChefHat size={20} />}
            colorClass="text-warning bg-warning-subtle"
          />
          <StatusKpiCard
            id="kpi-ready"
            label="Ready for Pickup"
            value={readyCount}
            icon={<CheckCircle2 size={20} />}
            colorClass="text-info bg-info-subtle"
          />
          <StatusKpiCard
            id="kpi-completed"
            label="Completed"
            value={completedCount}
            icon={<CheckCircle2 size={20} />}
            colorClass="text-success bg-success-subtle"
          />
        </div>
      </section>

      {/* ── Meal Type Breakdown ─────────────────────────────────────────── */}
      <section aria-label="Meal type breakdown">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4 flex items-center gap-2">
          <Utensils size={18} className="text-turmeric-500" />
          Today's Meal Counts
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <MealTypeCard
            id="meal-breakfast"
            label="Breakfast"
            mealType="breakfast"
            summary={byMealType.breakfast}
            icon={<Sun size={18} className="text-turmeric-500" />}
            accentClass="border-turmeric-200 bg-turmeric-50/40"
          />
          <MealTypeCard
            id="meal-lunch"
            label="Lunch"
            mealType="lunch"
            summary={byMealType.lunch}
            icon={<Utensils size={18} className="text-leaf-600" />}
            accentClass="border-leaf-200 bg-leaf-50/40"
          />
          <MealTypeCard
            id="meal-dinner"
            label="Dinner"
            mealType="dinner"
            summary={byMealType.dinner}
            icon={<Moon size={18} className="text-info" />}
            accentClass="border-info-subtle bg-info-subtle/30"
          />
        </div>
      </section>

      {/* ── Bottom row: Workflow Queue + Zone Distribution ──────────────── */}
      <div className="grid sm:grid-cols-2 gap-6">
        {/* Workflow queue breakdown */}
        <Card className="p-6">
          <h2 className="font-display text-base font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <Clock size={16} className="text-ink-500" />
            Workflow Queue
          </h2>
          <div className="space-y-3">
            <WorkflowRow
              label="Scheduled"
              count={scheduledCount}
              total={totalOrders}
              tone="neutral"
            />
            <WorkflowRow
              label="Preparing"
              count={preparingCount}
              total={totalOrders}
              tone="warning"
            />
            <WorkflowRow
              label="Ready for Pickup"
              count={readyCount}
              total={totalOrders}
              tone="info"
            />
            <WorkflowRow
              label="Completed"
              count={completedCount}
              total={totalOrders}
              tone="success"
            />
          </div>
        </Card>

        {/* Zone distribution */}
        <Card className="p-6">
          <h2 className="font-display text-base font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-ink-500" />
            Zone Distribution
          </h2>
          {Object.keys(byZone).length === 0 ? (
            <p className="text-sm text-ink-400 font-sans italic">
              No zone data available.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Order count by delivery zone">
              {Object.entries(byZone)
                .sort(([, a], [, b]) => b - a)
                .map(([zoneId, count]) => (
                  <li key={zoneId} className="flex items-center justify-between text-sm font-sans">
                    <span className="text-ink-700 flex items-center gap-1.5">
                      <MapPin size={12} className="text-ink-400" />
                      {zoneId === 'unassigned' ? (
                        <span className="italic text-ink-400">Unassigned</span>
                      ) : (
                        <span className="font-medium">{zoneId}</span>
                      )}
                    </span>
                    <span className="font-data text-ink-900 font-semibold">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Last updated ────────────────────────────────────────────────── */}
      <p className="text-center text-xs text-ink-400 font-sans pb-4">
        Live data · Last refreshed{' '}
        <time dateTime={dashboard.asOf}>
          {new Intl.DateTimeFormat('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: APP_CONFIG.timezone,
          }).format(new Date(dashboard.asOf))}
        </time>{' '}
        IST
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (co-located — Kitchen-only, not shared)
// ─────────────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  today: string;
  isFetching: boolean;
  onRefresh: () => void;
}

function PageHeader({ today, isFetching, onRefresh }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <ChefHat size={28} className="text-leaf-600" />
          Kitchen Operations
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          <time dateTime={today}>{formatDisplayDate(today)}</time>
          {' · '}Live production board
        </p>
      </div>
      <Button
        id="kitchen-refresh-btn"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        isLoading={isFetching}
        aria-label="Refresh kitchen data"
        className="self-start sm:self-auto"
      >
        <RefreshCw size={14} />
        Refresh
      </Button>
    </div>
  );
}

interface StatusKpiCardProps {
  id: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}

function StatusKpiCard({ id, label, value, icon, colorClass }: StatusKpiCardProps) {
  return (
    <Card
      id={id}
      className="p-5 flex flex-col gap-3"
      aria-label={`${label}: ${value}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="font-data text-2xl font-bold text-ink-900 leading-tight">{value}</p>
        <p className="text-xs text-ink-500 font-sans mt-0.5">{label}</p>
      </div>
    </Card>
  );
}

interface MealTypeCardProps {
  id: string;
  label: string;
  mealType: MealType;
  summary: MealTypeSummary;
  icon: React.ReactNode;
  accentClass: string;
}

function MealTypeCard({ id, label, summary, icon, accentClass }: MealTypeCardProps) {
  return (
    <Card
      id={id}
      className={`p-5 border ${accentClass}`}
      aria-label={`${label} meal summary`}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-display font-semibold text-ink-900">{label}</h3>
        <span className="ml-auto font-data text-xl font-bold text-ink-900">
          {summary.total}
        </span>
      </div>

      <div className="space-y-1.5 text-xs font-sans">
        <MealStatusRow label="Scheduled"      value={summary.scheduled}     tone="neutral" />
        <MealStatusRow label="Preparing"      value={summary.preparing}     tone="warning" />
        <MealStatusRow label="Ready"          value={summary.readyForPickup} tone="info"   />
        <MealStatusRow label="Done"           value={summary.pickedUp}      tone="success" />
      </div>
    </Card>
  );
}

interface MealStatusRowProps {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'info' | 'success';
}

function MealStatusRow({ label, value, tone }: MealStatusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <Badge tone={tone}>{label}</Badge>
      <span className="font-data font-semibold text-ink-900">{value}</span>
    </div>
  );
}

interface WorkflowRowProps {
  label: string;
  count: number;
  total: number;
  tone: 'neutral' | 'warning' | 'info' | 'success';
}

function WorkflowRow({ label, count, total, tone }: WorkflowRowProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-sm font-sans mb-1">
        <Badge tone={tone}>{label}</Badge>
        <span className="font-data font-semibold text-ink-900 text-xs">
          {count}
          <span className="text-ink-400 font-normal"> / {total}</span>
        </span>
      </div>
      <div
        className="w-full h-1.5 bg-rice-200 rounded-full overflow-hidden"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${TONE_BAR[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  neutral: 'bg-rice-400',
  warning: 'bg-warning',
  info:    'bg-info',
  success: 'bg-success',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDisplayDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: APP_CONFIG.timezone,
  }).format(new Date(`${isoDate}T00:00:00+05:30`));
}
