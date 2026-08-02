import { cn } from '@/shared/lib/cn';
import type { OrderStatus } from '@/shared/types';

interface StatusChipProps {
  status: OrderStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string; dot: string }> = {
  scheduled:       { label: 'Scheduled',        bg: 'bg-[#F3EBF7]', text: 'text-[#6A1B9A]', dot: 'bg-[#9C27B0]' },
  preparing:       { label: 'Preparing',         bg: 'bg-info-subtle', text: 'text-info', dot: 'bg-info' },
  ready_for_pickup:{ label: 'Ready',             bg: 'bg-pastel-lavender', text: 'text-secondary', dot: 'bg-secondary' },
  picked_up:       { label: 'Picked Up',         bg: 'bg-pastel-indigo', text: 'text-[#283593]', dot: 'bg-[#3F51B5]' },
  out_for_delivery:{ label: 'Out for Delivery',  bg: 'bg-pastel-orange', text: 'text-[#E65100]', dot: 'bg-[#E65100]' },
  delivered:       { label: 'Delivered',         bg: 'bg-success-subtle', text: 'text-success', dot: 'bg-success' },
  failed_delivery: { label: 'Failed',            bg: 'bg-danger-subtle', text: 'text-danger', dot: 'bg-danger' },
  returned_delivery:{ label: 'Returned',         bg: 'bg-surface-3', text: 'text-[#455A64]', dot: 'bg-[#607D8B]' },
  skipped:         { label: 'Skipped',           bg: 'bg-surface-3', text: 'text-text-muted', dot: 'bg-text-muted' },
  cancelled:       { label: 'Cancelled',         bg: 'bg-surface-3', text: 'text-text-muted', dot: 'bg-text-muted' },
  locked: { label: 'Locked', bg: 'bg-surface-3', text: 'text-text-muted', dot: 'bg-text-muted' },
  closed: { label: 'Closed', bg: 'bg-surface-3', text: 'text-text-muted', dot: 'bg-text-muted' },
  reopened: { label: 'Reopened', bg: 'bg-surface-3', text: 'text-text-muted', dot: 'bg-text-muted' },
};

export function StatusChip({ status, size = 'md', showDot = true, className }: StatusChipProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold border border-black/8 select-none',
        config.bg,
        config.text,
        size === 'sm' ? 'px-2 py-0.5 text-[10px] tracking-wide' : 'px-2.5 py-1 text-xs tracking-wide',
        className
      )}
    >
      {showDot && (
        <span className={cn('inline-block rounded-full shrink-0', config.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      )}
      {config.label}
    </span>
  );
}
