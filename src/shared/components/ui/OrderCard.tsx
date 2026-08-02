import { useState } from 'react';
import { MapPin, IndianRupee, ChevronDown, ChevronUp, Phone, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { StatusChip } from './StatusChip';
import { DriverBadge } from './DriverBadge';
import { MealBadge } from './MealBadge';
import { PremiumButton } from './PremiumButton';
import type { Order, OrderStatus } from '@/shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Timeline — next valid action per status
// ─────────────────────────────────────────────────────────────────────────────

type WorkflowStep = {
  label: string;
  nextStatus: OrderStatus;
  variant: 'primary' | 'success-tonal' | 'warning-tonal' | 'success' | 'tonal';
};

const KITCHEN_WORKFLOW: Partial<Record<OrderStatus, WorkflowStep>> = {
  // Purely observational. Auto-readiness removes the need for manual button clicks.
};

const DELIVERY_WORKFLOW: Partial<Record<OrderStatus, WorkflowStep>> = {
  scheduled:        { label: 'Mark as Picked Up',      nextStatus: 'picked_up',        variant: 'primary' },
  ready_for_pickup: { label: 'Confirm Pickup',         nextStatus: 'picked_up',        variant: 'primary' },
  picked_up:        { label: 'Start Delivery',         nextStatus: 'out_for_delivery', variant: 'warning-tonal' },
  out_for_delivery: { label: 'Mark as Delivered',      nextStatus: 'delivered',        variant: 'success' },
};

const ADMIN_WORKFLOW: Partial<Record<OrderStatus, WorkflowStep>> = {
  ...DELIVERY_WORKFLOW,
};

const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'failed_delivery', 'returned_delivery', 'skipped', 'cancelled'];

// ─────────────────────────────────────────────────────────────────────────────
// Customer Avatar
// ─────────────────────────────────────────────────────────────────────────────

function CustomerAvatar({ name, photoUrl, size = 'md' }: {
  name: string;
  photoUrl?: string | null;
  displayId?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initial = name?.trim().charAt(0).toUpperCase() || '?';
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn('rounded-full object-cover shrink-0 border border-border', sizeClasses[size])}
      />
    );
  }

  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br from-primary to-secondary text-white font-bold flex items-center justify-center shrink-0 border-2 border-white shadow-xs',
      sizeClasses[size]
    )}>
      {initial}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Action Row
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowTimelineProps {
  status: OrderStatus;
  variant: 'admin' | 'kitchen' | 'delivery';
  onStatusChange?: (newStatus: OrderStatus, extra?: { reasonCode: string; notes?: string }) => Promise<void> | void;
  isAdvancing?: boolean;
}

function WorkflowTimeline({ status, variant, onStatusChange, isAdvancing }: WorkflowTimelineProps) {
  const [showFail, setShowFail] = useState(false);
  const [failReason, setFailReason] = useState('customer_unavailable');
  const [failNotes, setFailNotes] = useState('');

  if (TERMINAL_STATUSES.includes(status)) {
    return (
      <div className="text-xs text-text-muted italic font-medium">
        {status === 'delivered' ? '✓ Completed' : '⚠ Terminal State'}
      </div>
    );
  }

  const workflow = variant === 'kitchen' ? KITCHEN_WORKFLOW : variant === 'delivery' ? DELIVERY_WORKFLOW : ADMIN_WORKFLOW;
  const step = workflow[status];

  if (!step) return null;

  const handleAction = async () => {
    if (!onStatusChange) return;
    if (step.nextStatus === 'delivered') {
      if (!confirm('Mark order as Delivered?')) return;
    } else if (step.nextStatus === 'picked_up') {
      if (!confirm('Confirm Pickup?')) return;
    }
    await onStatusChange(step.nextStatus);
  };

  const handleFail = async () => {
    if (!onStatusChange) return;
    await onStatusChange('failed_delivery', { reasonCode: failReason, notes: failNotes });
    setShowFail(false);
    setFailReason('customer_unavailable');
    setFailNotes('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {step && (
          <PremiumButton
            size="sm"
            variant={step.variant}
            onClick={handleAction}
            isLoading={isAdvancing}
            disabled={isAdvancing}
          >
            {step.label}
          </PremiumButton>
        )}
        {variant === 'delivery' && status === 'out_for_delivery' && (
          <PremiumButton
            size="sm"
            variant="danger-tonal"
            onClick={() => setShowFail(!showFail)}
          >
            ✗ Failed
          </PremiumButton>
        )}
      </div>

      <AnimatePresence>
        {showFail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-danger-subtle rounded-[12px] p-3 space-y-2 border border-danger/20">
              <p className="text-xs font-semibold text-danger">Failure Reason</p>
              <select
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                className="w-full h-9 rounded-[10px] border border-danger/30 bg-white text-sm text-text px-3 focus:outline-none focus:ring-1 focus:ring-danger/40"
              >
                <option value="customer_unavailable">Customer Unavailable</option>
                <option value="wrong_address">Wrong Address</option>
                <option value="customer_refused">Customer Refused</option>
                <option value="access_blocked">Access Blocked</option>
                <option value="other">Other</option>
              </select>
              <textarea
                placeholder="Notes (optional)"
                value={failNotes}
                onChange={(e) => setFailNotes(e.target.value)}
                className="w-full h-16 rounded-[10px] border border-danger/30 bg-white text-sm text-text px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-danger/40"
              />
              <div className="flex gap-2">
                <PremiumButton size="sm" variant="danger" onClick={handleFail} isLoading={isAdvancing}>
                  Confirm Failure
                </PremiumButton>
                <PremiumButton size="sm" variant="ghost" onClick={() => setShowFail(false)}>
                  Cancel
                </PremiumButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderCard — Main Component
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderCardProps {
  order: Order;
  variant: 'admin' | 'kitchen' | 'delivery';
  customer?: {
    fullName: string;
    displayId?: string;
    phone?: string;
    photoUrl?: string | null;
    address?: string;
    addressCoords?: { lat: number; lng: number } | null;
  } | null;
  partnerName?: string | null;
  planName?: string | null;
  zoneName?: string | null;
  onStatusChange?: (orderId: string, newStatus: OrderStatus, extra?: { reasonCode: string; notes?: string }) => Promise<void> | void;
  isAdvancing?: boolean;
  isTerminal?: boolean;
  /** Admin: extra actions (re-assign partner etc) */
  extraActions?: React.ReactNode;
  className?: string;
  sequenceNumber?: number;
}

export function OrderCard({
  order,
  variant,
  customer,
  partnerName,
  planName,
  zoneName,
  onStatusChange,
  isAdvancing = false,
  extraActions,
  className,
  sequenceNumber,
}: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isTerminal = TERMINAL_STATUSES.includes(order.status);
  const customerName = customer?.fullName || 'Unknown Customer';
  const displayId = customer?.displayId;
  const address = customer?.address;
  const addressCoords = customer?.addressCoords;

  const handleStatusChange = onStatusChange
    ? (newStatus: OrderStatus, extra?: { reasonCode: string; notes?: string }) =>
        onStatusChange(order.id, newStatus, extra)
    : undefined;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'bg-card rounded-[20px] border border-border shadow-card overflow-hidden',
        'transition-shadow duration-200 hover:shadow-md',
        isTerminal && 'opacity-70',
        className
      )}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: Avatar + ID + Name */}
          <div className="flex items-center gap-3 min-w-0">
            {sequenceNumber !== undefined ? (
              <div className="w-9 h-9 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                {sequenceNumber}
              </div>
            ) : (
              <CustomerAvatar name={customerName} photoUrl={customer?.photoUrl} size="md" />
            )}
            <div className="min-w-0">
              {displayId && (
                <div className="font-mono text-[13px] font-bold text-primary leading-tight tracking-wide">
                  {displayId}
                </div>
              )}
              <div className={cn(
                'font-semibold text-text leading-tight truncate',
                displayId ? 'text-sm' : 'text-base'
              )}>
                {customerName}
              </div>
            </div>
          </div>

          {/* Right: Price + Status */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {order.price > 0 && (
              <div className="flex items-center gap-0.5 font-bold text-primary">
                <IndianRupee size={13} />
                <span className="text-sm font-mono">{order.price}</span>
              </div>
            )}
            <StatusChip status={order.status} size="sm" />
          </div>
        </div>

        {/* Address Row */}
        {address && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted">
            <MapPin size={12} className="shrink-0 text-secondary" />
            <span className="truncate">{address}</span>
          </div>
        )}

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <MealBadge mealType={order.mealType} compact />
          {planName && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pastel-lavender text-secondary border border-secondary/15">
              {planName}
            </span>
          )}
          {zoneName && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-2 text-text-muted border border-border">
              📍 {zoneName}
            </span>
          )}
          <DriverBadge partnerName={partnerName} compact />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-4" />

      {/* Actions + Expand */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Workflow Timeline */}
          <div className="flex-1 min-w-0">
            {handleStatusChange ? (
              <WorkflowTimeline
                status={order.status}
                variant={variant}
                onStatusChange={handleStatusChange}
                isAdvancing={isAdvancing}
              />
            ) : null}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Delivery-specific quick actions */}
            {variant === 'delivery' && customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-success-subtle text-success hover:bg-success hover:text-white transition-colors"
                title="Call customer"
              >
                <Phone size={16} />
              </a>
            )}
            {variant === 'delivery' && (addressCoords || address) && (
              <a
                href={addressCoords ? `https://maps.google.com/?q=${addressCoords.lat},${addressCoords.lng}` : `https://maps.google.com/?q=${encodeURIComponent(address!)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-info-subtle text-info hover:bg-info hover:text-white transition-colors"
                title="Navigate"
              >
                <Navigation size={16} />
              </a>
            )}
            {extraActions}

            {/* Expand/collapse toggle */}
            <button aria-label="Button action"
              onClick={() => setExpanded(!expanded)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-muted hover:bg-surface-3 transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border bg-surface-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {order.itemsLabel && (
                  <div>
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Items</p>
                    <p className="text-text font-medium">{order.itemsLabel}</p>
                  </div>
                )}
                {customer?.phone && (
                  <div>
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Phone</p>
                    <p className="text-text font-medium">{customer.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Date</p>
                  <p className="text-text font-medium">{order.date}</p>
                </div>
                {order.deliveryWindow && (
                  <div>
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Window</p>
                    <p className="text-text font-medium">{order.deliveryWindow.start}–{order.deliveryWindow.end}</p>
                  </div>
                )}
                {order.deliveryResult && (
                  <div className="col-span-2">
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Failure</p>
                    <p className="text-danger font-medium">
                      {order.deliveryResult.reasonCode}
                      {order.deliveryResult.notes && ` — ${order.deliveryResult.notes}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
