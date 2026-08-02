import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-semibold border transition-colors',
  {
    variants: {
      variant: {
        // Generic semantic variants
        success:  'bg-success-subtle text-success border-success/25 px-3 py-1 text-xs',
        warning:  'bg-warning-subtle text-warning border-warning/25 px-3 py-1 text-xs',
        danger:   'bg-danger-subtle text-danger border-danger/25 px-3 py-1 text-xs',
        info:     'bg-info-subtle text-info border-info/25 px-3 py-1 text-xs',
        default:  'bg-surface-2 text-text border-border px-3 py-1 text-xs',

        // Order workflow status variants
        scheduled:
          'bg-[#F3EBF7] text-[#6A1B9A] border-[#CE93D8] px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        preparing:
          'bg-info-subtle text-info border-info/30 px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        ready_for_pickup:
          'bg-pastel-lavender text-secondary border-secondary/30 px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        picked_up:
          'bg-pastel-indigo text-[#283593] border-[#9FA8DA] px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        out_for_delivery:
          'bg-pastel-orange text-[#E65100] border-[#FFCC80] px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        delivered:
          'bg-success-subtle text-success border-success/30 px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        failed_delivery:
          'bg-danger-subtle text-danger border-danger/30 px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        returned_delivery:
          'bg-surface-3 text-[#455A64] border-[#B0BEC5] px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        skipped:
          'bg-surface-3 text-text-muted border-border px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        cancelled:
          'bg-surface-3 text-text-muted border-border px-2.5 py-0.5 text-[11px] uppercase tracking-wider',

        // Meal type variants
        breakfast:
          'bg-[#FFF8E1] text-[#FF8F00] border-[#FFD54F] px-2.5 py-0.5 text-[11px]',
        lunch:
          'bg-success-subtle text-success border-success/30 px-2.5 py-0.5 text-[11px]',
        dinner:
          'bg-info-subtle text-info border-info/30 px-2.5 py-0.5 text-[11px]',

        // Plan tier variants
        basic:
          'bg-surface-2 text-text-muted border-border px-2 py-0.5 text-[10px] uppercase tracking-wider',
        regular:
          'bg-pastel-lavender text-primary border-secondary/25 px-2 py-0.5 text-[10px] uppercase tracking-wider',
        premium:
          'bg-gold-pale text-[#B8860B] border-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wider',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface PremiumBadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  tone?: VariantProps<typeof badgeVariants>['variant'];
  dot?: boolean;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  scheduled: 'bg-[#9C27B0]',
  preparing: 'bg-info',
  ready_for_pickup: 'bg-secondary',
  picked_up: 'bg-[#3F51B5]',
  out_for_delivery: 'bg-[#E65100]',
  delivered: 'bg-success',
  failed_delivery: 'bg-danger',
  returned_delivery: 'bg-[#455A64]',
  skipped: 'bg-text-muted',
  cancelled: 'bg-text-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export const PremiumBadge = forwardRef<HTMLDivElement, PremiumBadgeProps>(
  ({ className, variant, tone, dot, children, ...props }, ref) => {
    const effectiveVariant = variant || tone;
    const dotColor = effectiveVariant ? STATUS_DOT_COLORS[effectiveVariant] : 'bg-text-muted';
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant: effectiveVariant, className }))}
        {...props}
      >
        {dot && (
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
        )}
        {children}
      </div>
    );
  }
);
PremiumBadge.displayName = 'PremiumBadge';
