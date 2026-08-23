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
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
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
import { StaffAttendanceCard } from '@/features/hr/components/StaffAttendanceCard';

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
            ? (error as Error).message
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
          icon={<ChefHat size={48} className="text-primary/40" />}
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
  const packingCount     = byStatus.packing          ?? 0;
  const readyCount       = byStatus.ready_for_pickup ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader today={today} isFetching={isFetching} onRefresh={refetch} />

      <StaffAttendanceCard />

      {/* ── Production Progress Bar ─────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/5 p-2 rounded-xl border border-primary/10">
              <TrendingUp size={20} className="text-primary" />
            </div>
            <h2 className="font-display text-lg font-bold text-primary">
              Production Progress
            </h2>
          </div>
          <span
            className="font-data text-sm font-bold text-gold"
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
          className="w-full h-3 bg-primary/10 rounded-full overflow-hidden shadow-inner"
        >
          <div
            className="h-full bg-gradient-to-r from-gold to-gold-dark rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-3 text-xs font-bold text-text-muted font-sans uppercase tracking-wider">
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
            colorClass="text-primary bg-primary/10 border border-primary/20"
          />
          <StatusKpiCard
            id="kpi-packing"
            label="Packing"
            value={packingCount}
            icon={<ChefHat size={20} />}
            colorClass="text-amber-600 bg-amber-500/10 border border-amber-500/20"
          />
          <StatusKpiCard
            id="kpi-ready"
            label="Ready for Pickup"
            value={readyCount}
            icon={<CheckCircle2 size={20} />}
            colorClass="text-blue-600 bg-blue-500/10 border border-blue-500/20"
          />
          <StatusKpiCard
            id="kpi-completed"
            label="Completed"
            value={completedCount}
            icon={<CheckCircle2 size={20} />}
            colorClass="text-emerald-600 bg-emerald-500/10 border border-emerald-500/20"
          />
        </div>
      </section>

      {/* ── Meal Type Breakdown ─────────────────────────────────────────── */}
      <section aria-label="Meal type breakdown">
        <h2 className="font-display text-xl font-bold text-primary mb-6 flex items-center gap-3">
          <div className="bg-primary/5 p-2 rounded-xl border border-primary/10">
            <Utensils size={20} className="text-primary" />
          </div>
          Today's Meal Counts
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          <MealTypeCard
            id="meal-breakfast"
            label="Breakfast"
            mealType="breakfast"
            summary={byMealType.breakfast}
            icon={<Sun size={20} className="text-amber-500" />}
            accentClass="border-amber-500/20 bg-gradient-to-br from-background to-amber-500/5 shadow-sm"
          />
          <MealTypeCard
            id="meal-lunch"
            label="Lunch"
            mealType="lunch"
            summary={byMealType.lunch}
            icon={<Utensils size={20} className="text-emerald-500" />}
            accentClass="border-emerald-500/20 bg-gradient-to-br from-background to-emerald-500/5 shadow-sm"
          />
          <MealTypeCard
            id="meal-dinner"
            label="Dinner"
            mealType="dinner"
            summary={byMealType.dinner}
            icon={<Moon size={20} className="text-blue-500" />}
            accentClass="border-blue-500/20 bg-gradient-to-br from-background to-blue-500/5 shadow-sm"
          />
        </div>
      </section>

      {/* ── Bottom row: Workflow Queue + Zone Distribution ──────────────── */}
      <div className="grid sm:grid-cols-2 gap-6">
        {/* Workflow queue breakdown */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold text-primary mb-6 flex items-center gap-3">
            <div className="bg-primary/5 p-2 rounded-xl border border-primary/10">
              <Clock size={18} className="text-primary" />
            </div>
            Workflow Queue
          </h2>
          <div className="space-y-3">
            <WorkflowRow
              label="Scheduled"
              count={scheduledCount}
              total={totalOrders}
              variant="default"
            />
            <WorkflowRow
              label="Packing"
              count={packingCount}
              total={totalOrders}
              variant="warning"
            />
            <WorkflowRow
              label="Ready for Pickup"
              count={readyCount}
              total={totalOrders}
              variant="info"
            />
            <WorkflowRow
              label="Completed"
              count={completedCount}
              total={totalOrders}
              variant="success"
            />
          </div>
        </Card>

        {/* Zone distribution */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold text-primary mb-6 flex items-center gap-3">
            <div className="bg-primary/5 p-2 rounded-xl border border-primary/10">
              <MapPin size={18} className="text-primary" />
            </div>
            Zone Distribution
          </h2>
          {Object.keys(byZone).length === 0 ? (
            <p className="text-sm text-text-muted font-sans font-medium">
              No zone data available.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Order count by delivery zone">
              {Object.entries(byZone)
                .sort(([, a], [, b]) => b - a)
                .map(([zoneId, count]) => (
                  <li key={zoneId} className="flex items-center justify-between text-sm font-sans p-2 rounded-lg hover:bg-primary/5 transition-colors">
                    <span className="text-primary flex items-center gap-2">
                      <MapPin size={14} className="text-primary/40" />
                      {zoneId === 'unassigned' ? (
                        <span className="font-medium text-text-muted">Unassigned</span>
                      ) : (
                        <span className="font-bold">{zoneId}</span>
                      )}
                    </span>
                    <span className="font-data text-primary font-bold bg-background-alt px-2 py-1 rounded border border-primary/10">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Last updated ────────────────────────────────────────────────── */}
      <p className="text-center text-xs font-bold text-text-muted font-sans pb-4 uppercase tracking-wider">
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
    <HeroBanner
      userName="Kitchen Team"
      subtitle={`Live production board for ${formatDisplayDate(today)}`}
      actions={
        <Button
          variant="secondary"
          onClick={onRefresh}
          isLoading={isFetching}
          className="text-primary border-gold/40 hover:bg-gold/10"
        >
          <RefreshCw size={16} className="mr-2" />
          Refresh Data
        </Button>
      }
    />
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
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="font-display text-3xl font-bold text-primary leading-tight">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted font-sans mt-1">{label}</p>
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
      className={`p-6 border transition-all hover:border-gold/30 hover:shadow-md ${accentClass}`}
      aria-label={`${label} meal summary`}
    >
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h3 className="font-display font-bold text-xl text-primary">{label}</h3>
        <span className="ml-auto font-display text-2xl font-bold text-primary">
          {summary.total}
        </span>
      </div>

      <div className="space-y-1.5 text-xs font-sans">
        <MealStatusRow label="Scheduled"      value={summary.scheduled}     variant="default" />
        <MealStatusRow label="Packing"        value={summary.packing}       variant="warning" />
        <MealStatusRow label="Ready"          value={summary.readyForPickup} variant="info"   />
        <MealStatusRow label="Done"           value={summary.pickedUp}      variant="success" />
      </div>
    </Card>
  );
}

interface MealStatusRowProps {
  label: string;
  value: number;
  variant: 'default' | 'warning' | 'info' | 'success';
}

function MealStatusRow({ label, value, variant: tone }: MealStatusRowProps) {
  const variant = tone === 'default' ? 'default' : tone;
  return (
    <div className="flex items-center justify-between">
      <Badge variant={variant} className="text-[10px] uppercase font-bold tracking-wider">{label}</Badge>
      <span className="font-data font-bold text-primary">{value}</span>
    </div>
  );
}

interface WorkflowRowProps {
  label: string;
  count: number;
  total: number;
  variant: 'default' | 'warning' | 'info' | 'success';
}

function WorkflowRow({ label, count, total, variant: tone }: WorkflowRowProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const variant = tone === 'default' ? 'default' : tone;

  return (
    <div>
      <div className="flex items-center justify-between text-sm font-sans mb-1">
        <Badge variant={variant} className="text-[10px] uppercase font-bold tracking-wider">{label}</Badge>
        <span className="font-data font-bold text-primary text-xs bg-background-alt px-1.5 py-0.5 rounded border border-primary/5">
          {count}
          <span className="text-text-muted font-medium ml-1">/ {total}</span>
        </span>
      </div>
      <div
        className="w-full h-2 bg-primary/5 border border-primary/10 rounded-full overflow-hidden shadow-inner mt-2"
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
  neutral: 'bg-primary/30',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
  success: 'bg-emerald-500',
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
