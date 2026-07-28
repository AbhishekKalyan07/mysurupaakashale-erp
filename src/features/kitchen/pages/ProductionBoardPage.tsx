import { useState } from 'react';
import {
  ChefHat, Sun, Utensils, Moon, Search, ChevronRight,
  Loader2, RefreshCw, CheckCircle2, Clock, AlertCircle, MapPin, User,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumBadge as Badge, type PremiumBadgeProps } from '@/shared/components/ui/PremiumBadge';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { APP_CONFIG } from '@/shared/config/appConfig';
import {
  useProductionBoard,
  getTodayIST,
  type MealSection,
  type EnrichedOrder,
  type ProductionBoardFilters,
  type KitchenWorkflowStatus,
} from '@/features/kitchen/hooks/useProductionBoard';
import type { MealType } from '@/shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// ProductionBoardPage
// ─────────────────────────────────────────────────────────────────────────────

export function ProductionBoardPage() {
  const today = getTodayIST();
  const {
    breakfast, lunch, dinner,
    filters, setFilters,
    allZones,
    isAnyLoading,
    advanceStatus,
    isAdvancing,
  } = useProductionBoard();

  // ── Initial loading ────────────────────────────────────────────────────────
  if (isAnyLoading) return <div className="p-8"><DashboardCardsSkeleton /></div>;

  const totalOrders = breakfast.total + lunch.total + dinner.total;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <ChefHat size={28} className="text-leaf-600" />
            Production Board
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            <time dateTime={today}>{formatDisplayDate(today)}</time>
            {' · '}{totalOrders} total orders
          </p>
        </div>
      </div>

      {/* ── Filter & Search Bar ─────────────────────────────────────────────── */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        allZones={allZones}
      />

      {/* ── Empty (no orders at all) ────────────────────────────────────────── */}
      {totalOrders === 0 && (
        <EmptyState
          icon={<ChefHat size={40} className="text-leaf-300" />}
          title="No orders for today"
          description="Daily order generation runs at 02:00 AM IST. Orders will appear here automatically."
        />
      )}

      {/* ── Meal Sections ───────────────────────────────────────────────────── */}
      {totalOrders > 0 && (
        <div className="space-y-8">
          <MealSectionPanel
            section={breakfast}
            mealType="breakfast"
            label="Breakfast"
            icon={<Sun size={18} className="text-turmeric-500" />}
            accentClass="border-turmeric-200"
            headerBg="bg-turmeric-50"
            onAdvance={advanceStatus}
            isAdvancing={isAdvancing}
          />
          <MealSectionPanel
            section={lunch}
            mealType="lunch"
            label="Lunch"
            icon={<Utensils size={18} className="text-leaf-600" />}
            accentClass="border-leaf-200"
            headerBg="bg-leaf-50"
            onAdvance={advanceStatus}
            isAdvancing={isAdvancing}
          />
          <MealSectionPanel
            section={dinner}
            mealType="dinner"
            label="Dinner"
            icon={<Moon size={18} className="text-info" />}
            accentClass="border-info-subtle"
            headerBg="bg-info-subtle/40"
            onAdvance={advanceStatus}
            isAdvancing={isAdvancing}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar
// ─────────────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: ProductionBoardFilters;
  setFilters: React.Dispatch<React.SetStateAction<ProductionBoardFilters>>;
  allZones: string[];
}

function FilterBar({ filters, setFilters, allZones }: FilterBarProps) {
  const update = <K extends keyof ProductionBoardFilters>(
    key: K,
    value: ProductionBoardFilters[K]
  ) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          id="prod-board-search"
          type="search"
          placeholder="Search customer or plan…"
          value={filters.searchQuery}
          onChange={(e) => update('searchQuery', e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-rice-200 bg-rice-25 text-sm font-sans text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
          aria-label="Search orders by customer or plan"
        />
      </div>

      {/* Status filter */}
      <select
        id="prod-board-status-filter"
        value={filters.statusFilter}
        onChange={(e) => update('statusFilter', e.target.value as ProductionBoardFilters['statusFilter'])}
        className="h-9 px-3 rounded-lg border border-rice-200 bg-rice-25 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        aria-label="Filter by workflow status"
      >
        <option value="all">All statuses</option>
        <option value="scheduled">Scheduled</option>
        <option value="preparing">Preparing</option>
        <option value="ready_for_pickup">Ready for Pickup</option>
      </select>

      {/* Zone filter */}
      <select
        id="prod-board-zone-filter"
        value={filters.zoneFilter}
        onChange={(e) => update('zoneFilter', e.target.value)}
        className="h-9 px-3 rounded-lg border border-rice-200 bg-rice-25 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        aria-label="Filter by delivery zone"
      >
        <option value="all">All zones</option>
        {allZones.map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        id="prod-board-sort"
        value={filters.sortBy}
        onChange={(e) => update('sortBy', e.target.value as ProductionBoardFilters['sortBy'])}
        className="h-9 px-3 rounded-lg border border-rice-200 bg-rice-25 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        aria-label="Sort orders"
      >
        <option value="customer">Sort: Customer</option>
        <option value="zone">Sort: Zone</option>
        <option value="status">Sort: Status</option>
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MealSectionPanel
// ─────────────────────────────────────────────────────────────────────────────

interface MealSectionPanelProps {
  section: MealSection;
  mealType: MealType;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  headerBg: string;
  onAdvance: (orderId: string, newStatus: KitchenWorkflowStatus) => Promise<void>;
  isAdvancing: boolean;
}

function MealSectionPanel({
  section, mealType, label, icon, accentClass, headerBg,
  onAdvance, isAdvancing,
}: MealSectionPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (section.isError) {
    return (
      <ErrorState
        title={`Could not load ${label.toLowerCase()} orders`}
        description={section.error?.message ?? 'Unknown error'}
      />
    );
  }

  const filtered = section.filteredOrders;
  const showingAll = filtered.length === section.total;

  return (
    <section
      aria-label={`${label} orders`}
      className={cn('rounded-xl border overflow-hidden shadow-card', accentClass)}
    >
      {/* Section header */}
      <button
        type="button"
        onClick={() => setIsCollapsed((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between px-5 py-4',
          headerBg,
          'hover:brightness-95 transition-all'
        )}
        aria-expanded={!isCollapsed}
        aria-controls={`section-${mealType}`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="font-display text-lg font-bold text-ink-900">{label}</h2>
          {/* Section totals */}
          <div className="flex items-center gap-2 ml-1">
            <SectionBadge label="Total" count={section.total} variant="default" />
            {section.scheduledCount > 0 && (
              <SectionBadge label="Sched" count={section.scheduledCount} variant="default" />
            )}
            {section.preparingCount > 0 && (
              <SectionBadge label="Pending" count={section.preparingCount} variant="warning" />
            )}
            {section.readyCount > 0 && (
              <SectionBadge label="Ready" count={section.readyCount} variant="success" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!showingAll && (
            <span className="text-xs text-ink-500 font-sans">
              {filtered.length} / {section.total} shown
            </span>
          )}
          <ChevronRight
            size={16}
            className={cn(
              'text-ink-400 transition-transform duration-200',
              !isCollapsed && 'rotate-90'
            )}
          />
        </div>
      </button>

      {/* Order cards */}
      {!isCollapsed && (
        <div id={`section-${mealType}`} className="bg-rice-25 p-4">
          {filtered.length === 0 ? (
            <EmptyState
              title={
                section.total === 0
                  ? `No ${label.toLowerCase()} orders today`
                  : 'No orders match the current filters'
              }
              description={
                section.total === 0
                  ? 'Orders will appear here after daily generation runs.'
                  : 'Try clearing the search or adjusting filters.'
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAdvance={onAdvance}
                  isAdvancing={isAdvancing}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderCard
// ─────────────────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: EnrichedOrder;
  onAdvance: (orderId: string, newStatus: KitchenWorkflowStatus) => Promise<void>;
  isAdvancing: boolean;
}

function OrderCard({ order, onAdvance, isAdvancing }: OrderCardProps) {
  const [advancing, setAdvancing] = useState(false);
  const nextStatus = NEXT_STATUS[order.status as KitchenWorkflowStatus];

  const handleAdvance = async () => {
    if (!nextStatus || advancing) return;
    
    if (!window.confirm(`Are you sure you want to advance this order to ${STATUS_DISPLAY_LABEL[nextStatus]}?`)) {
      return;
    }

    setAdvancing(true);
    try {
      await onAdvance(order.id, nextStatus);
    } finally {
      setAdvancing(false);
    }
  };

  const isTerminal = !nextStatus;
  
  const progressPercent = order.status === 'scheduled' ? 10 
                        : order.status === 'preparing' ? 50 
                        : order.status === 'ready_for_pickup' ? 100 : 0;

  return (
    <Card
      className={cn(
        'p-4 flex flex-col gap-3 transition-shadow hover:shadow-card-hover',
        STATUS_CARD_ACCENT[order.status] ?? ''
      )}
      aria-label={`Order for ${order.customerName}, status: ${order.status}`}
    >
      {/* Customer row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <User size={13} className="text-ink-400 shrink-0" />
          <span className="text-sm font-semibold text-ink-900 truncate" title={order.customerName}>
            {order.customerName}
          </span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-rice-200 rounded-full h-1.5 overflow-hidden">
        <div 
          className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            order.status === 'ready_for_pickup' ? 'bg-success' : 'bg-warning'
          )} 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>

      {/* Details grid */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-sans">
        <div>
          <dt className="text-ink-400">Plan</dt>
          <dd className="text-ink-900 font-medium capitalize">{order.planTier}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Preference</dt>
          <dd className="text-ink-900 font-medium truncate" title={order.itemsLabel}>
            {order.itemsLabel}
          </dd>
        </div>
        {order.zoneId && (
          <div className="col-span-2 flex items-center gap-1 text-ink-500">
            <MapPin size={11} />
            <span>{order.zoneId}</span>
          </div>
        )}
        <div>
          <dt className="text-ink-400">Window</dt>
          <dd className="font-data text-ink-700">
            {order.deliveryWindow?.start ?? '—'}–{order.deliveryWindow?.end ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">Order ID</dt>
          <dd className="font-data text-ink-500 text-[10px] truncate" title={order.id}>
            {order.id.split('_').slice(-2).join('_')}
          </dd>
        </div>
        
        {/* Timestamp */}
        <div className="col-span-2 flex items-center gap-2 mt-1 pt-2 border-t border-rice-200 text-[10px] text-ink-400">
          <Clock size={10} />
          <span>Updated: {order.updatedAt?.toDate().toLocaleTimeString('en-IN', { timeZone: APP_CONFIG.timezone })}</span>
          {order.operatorId && (
            <>
              <span className="mx-1">•</span>
              <User size={10} />
              <span className="truncate max-w-[100px]" title={order.operatorId}>
                Op: {order.operatorId.slice(0, 8)}
              </span>
            </>
          )}
        </div>
      </dl>

      {/* Advance button — only shown when next status exists */}
      {!isTerminal && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAdvance}
          disabled={isAdvancing || advancing}
          isLoading={advancing}
          className="w-full mt-1"
          aria-label={`Advance ${order.customerName}'s order to ${nextStatus}`}
        >
          {!advancing && <ChevronRight size={14} />}
          {ADVANCE_LABEL[nextStatus]}
        </Button>
      )}

      {/* Terminal state indicator */}
      {isTerminal && (
        <div className="flex items-center gap-1.5 text-xs text-success font-medium mt-1">
          <CheckCircle2 size={14} />
          Ready for pickup
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionBadge({ label, count, variant }: { label: string; count: number; variant: PremiumBadgeProps['variant'] }) {
  return (
    <Badge variant={variant} className="text-[10px] gap-1">
      {label} <span className="font-data font-bold">{count}</span>
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_BADGE_TONE[status] ?? 'default';
  const label = STATUS_DISPLAY_LABEL[status] ?? status;
  const icon = STATUS_ICON[status];
  return (
    <Badge variant={tone} className="shrink-0 gap-1 text-[10px]">
      {icon}
      {label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NEXT_STATUS: Partial<Record<string, KitchenWorkflowStatus>> = {
  scheduled: 'preparing',
  preparing: 'ready_for_pickup',
  // ready_for_pickup: undefined — terminal for kitchen
};

const ADVANCE_LABEL: Record<KitchenWorkflowStatus, string> = {
  scheduled:        'Start Preparing',
  preparing:        'Mark Ready for Pickup',
  ready_for_pickup: 'Mark Ready for Pickup', // fallback (shouldn't appear)
};

const STATUS_BADGE_TONE: Record<string, PremiumBadgeProps['variant']> = {
  scheduled:        'default',
  preparing:        'warning',
  ready_for_pickup: 'success',
  out_for_delivery: 'info',
  delivered:        'success',
  skipped:          'default',
  cancelled:        'danger',
  failed_delivery:  'danger',
};

const STATUS_DISPLAY_LABEL: Record<string, string> = {
  scheduled:        'Scheduled',
  preparing:        'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  skipped:          'Skipped',
  cancelled:        'Cancelled',
  failed_delivery:  'Failed',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  scheduled:        <Clock size={10} />,
  preparing:        <Loader2 size={10} className="animate-spin" />,
  ready_for_pickup: <CheckCircle2 size={10} />,
  out_for_delivery: <RefreshCw size={10} />,
  delivered:        <CheckCircle2 size={10} />,
  cancelled:        <AlertCircle size={10} />,
  failed_delivery:  <AlertCircle size={10} />,
};

const STATUS_CARD_ACCENT: Record<string, string> = {
  scheduled:        '',
  preparing:        'border-warning/40 bg-warning-subtle/20',
  ready_for_pickup: 'border-success/30 bg-success-subtle/20',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper
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
