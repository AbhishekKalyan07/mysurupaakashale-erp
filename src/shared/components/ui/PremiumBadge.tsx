import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider border transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-pastel-mint text-success border-success/30',
        warning: 'bg-pastel-amber text-warning border-warning/30',
        danger: 'bg-pastel-rose text-danger border-danger/30',
        info: 'bg-pastel-blue text-info border-info/30',
        default: 'bg-background text-primary border-gold/40',
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
}

export const PremiumBadge = forwardRef<HTMLDivElement, PremiumBadgeProps>(
  ({ className, variant, tone, ...props }, ref) => {
    // map legacy `tone` to `variant`
    const effectiveVariant = variant || tone;
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant: effectiveVariant, className }))} {...props} />
    );
  }
);
PremiumBadge.displayName = 'PremiumBadge';
