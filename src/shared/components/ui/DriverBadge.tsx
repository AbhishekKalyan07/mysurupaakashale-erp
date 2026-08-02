import { cn } from '@/shared/lib/cn';
import { Truck, AlertTriangle } from 'lucide-react';

interface DriverBadgeProps {
  partnerName?: string | null;
  compact?: boolean;
  className?: string;
}

export function DriverBadge({ partnerName, compact = false, className }: DriverBadgeProps) {
  const initial = partnerName?.trim().charAt(0).toUpperCase();

  if (!partnerName) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full font-semibold border',
          'bg-warning-subtle text-warning border-warning/25',
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
          className
        )}
      >
        <AlertTriangle size={compact ? 10 : 12} className="shrink-0" />
        Unassigned
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold border',
        'bg-pastel-teal text-[#00695C] border-[#009688]/25',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {initial ? (
        <span className={cn(
          'inline-flex items-center justify-center rounded-full bg-[#00695C] text-white font-bold shrink-0',
          compact ? 'w-3.5 h-3.5 text-[8px]' : 'w-4 h-4 text-[9px]'
        )}>
          {initial}
        </span>
      ) : (
        <Truck size={compact ? 10 : 12} className="shrink-0" />
      )}
      {partnerName}
    </span>
  );
}
