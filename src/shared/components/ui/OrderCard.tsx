import { useState } from 'react';
import { MapPin, IndianRupee, ChevronDown, ChevronUp, Phone, Navigation } from 'lucide-react';
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

const KITCHEN_WORKFLOW: Record<string, WorkflowStep> = {
  'scheduled':         { label: 'Start Packing',   nextStatus: 'packing',          variant: 'tonal' },
  'packing':           { label: 'Mark as Packed',   nextStatus: 'packed',           variant: 'primary' },
  'packed':            { label: 'Ready for Pickup', nextStatus: 'ready_for_pickup', variant: 'success' },
};

const DELIVERY_WORKFLOW: Partial<Record<OrderStatus, WorkflowStep>> = {
  ready_for_pickup: { label: 'Confirm Pickup',         nextStatus: 'picked_up',        variant: 'primary' },
  picked_up:        { label: 'Start Delivery',         nextStatus: 'out_for_delivery', variant: 'warning-tonal' },
  out_for_delivery: { label: 'Mark as Delivered',      nextStatus: 'delivered',        variant: 'success' },
};

const ADMIN_WORKFLOW: Partial<Record<OrderStatus, WorkflowStep>> = {
  ...DELIVERY_WORKFLOW,
};

const TERMINAL_STATUSES: string[] = ['delivered', 'failed_delivery', 'returned_delivery', 'skipped', 'cancelled'];

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
        {status === 'delivered' ? '✓ Completed' : `✗ ${status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`}
      </div>
    );
  }

  const workflow = variant === 'kitchen' ? KITCHEN_WORKFLOW : variant === 'delivery' ? DELIVERY_WORKFLOW : ADMIN_WORKFLOW;
  const step = (workflow as any)[status as any];

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

      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          showFail ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
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
        </div>
      </div>
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
  currentDeliveryPartnerId?: string | null;
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
  currentDeliveryPartnerId,
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
    <div
      className={cn(
        'bg-card rounded-[20px] border border-border shadow-card overflow-hidden transition-all duration-200 hover:shadow-md animate-in fade-in slide-in-from-bottom-2',
        isTerminal && 'opacity-70',
        className
      )}
    >
      {/* Delivery Zone Banner */}
      {variant === 'delivery' && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between">
          <div className="font-display font-bold text-primary text-sm flex items-center gap-1.5">
            📍 {zoneName || 'Unassigned Zone'}
          </div>
          <MealBadge mealType={order.mealType} compact={false} className="shadow-sm" />
        </div>
      )}

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
              {variant === 'kitchen' && (
                <div className="font-mono text-xs text-text-muted mt-0.5 opacity-70">
                  {order.id.split('_')[0] === 'ord' ? order.id.split('_').slice(1,2).join('') : order.id.slice(0, 8)}
                </div>
              )}
              {variant === 'delivery' && customer?.phone && (
                <div className="text-text-muted text-xs font-medium mt-0.5 flex items-center gap-1">
                  <Phone size={10} /> {customer.phone}
                </div>
              )}
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
          <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted min-w-0">
            <MapPin size={12} className="shrink-0 text-secondary" />
            <span className="truncate">{address}</span>
          </div>
        )}

        {/* Kitchen Pack Row */}
        {variant === 'kitchen' && (
          <div className="mt-3 p-3 bg-surface-2 border border-border rounded-lg shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Meal to Pack</p>
                <p className="text-base font-bold text-ink-900 leading-tight">{order.mealName || order.itemsLabel}</p>

                {order.specialInstructions && (
                  <p className="text-xs text-warning-dark font-medium bg-warning-subtle px-2 py-1 rounded inline-flex items-center gap-1 border border-warning/20">
                    <span>⚠️</span> {order.specialInstructions}
                  </p>
                )}
                {order.packingNotes && (
                  <p className="text-xs text-info-dark font-medium bg-info-subtle px-2 py-1 rounded inline-flex items-center gap-1 border border-info/20 mt-1">
                    <span>📝</span> {order.packingNotes}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Qty</p>
                <div className="w-10 h-10 rounded-xl bg-turmeric-100 text-turmeric-800 flex items-center justify-center font-black text-xl shadow-xs border-2 border-turmeric-300">
                  {order.mealQuantity || 1}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {variant !== 'delivery' && <MealBadge mealType={order.mealType} compact={variant !== 'kitchen'} />}
          {planName && (
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
              order.source === 'subscription'
                ? "bg-pastel-lavender text-secondary border-secondary/15"
                : "bg-surface-2 text-text-muted border-border"
            )}>
              {planName}
            </span>
          )}
          {zoneName && variant !== 'delivery' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-2 text-text-muted border border-border">
              📍 {zoneName}
            </span>
          )}
          {order.specialInstructions && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning-subtle text-warning-dark border border-warning/20">
              ⚠️ Alert
            </span>
          )}
          {order.packingNotes && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-info-subtle text-info-dark border border-info/20">
              📝 Notes
            </span>
          )}
          {order.deliveryPartnerId && order.deliveryPartnerId === currentDeliveryPartnerId ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success-subtle text-success border border-success/20">
              Assigned to You
            </span>
          ) : (
            <DriverBadge partnerName={partnerName} compact />
          )}
          {(variant === 'admin' || variant === 'delivery') && order.estimatedETA && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              🕒 ETA: {order.estimatedETA}
            </span>
          )}
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
            <button
              aria-label={expanded ? 'Collapse order details' : 'Expand order details'}
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
      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border bg-surface-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {order.itemsLabel && (
                  <div>
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Items</p>
                    <p className="text-text font-medium">{order.itemsLabel}</p>
                  </div>
                )}
                {(order.mealQuantity && order.mealQuantity > 1) ? (
                  <div>
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5">Quantity</p>
                    <p className="text-text font-bold text-turmeric-700">{order.mealQuantity}</p>
                  </div>
                ) : null}
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
                {order.specialInstructions && (
                  <div className="col-span-2">
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5 text-warning">Special Instructions</p>
                    <p className="text-warning-dark font-medium">{order.specialInstructions}</p>
                  </div>
                )}
                {order.packingNotes && (
                  <div className="col-span-2">
                    <p className="text-text-faint font-semibold uppercase tracking-wider text-[10px] mb-0.5 text-info">Packing Notes</p>
                    <p className="text-info-dark font-medium">{order.packingNotes}</p>
                  </div>
                )}
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
        </div>
      </div>
    </div>
  );
}
