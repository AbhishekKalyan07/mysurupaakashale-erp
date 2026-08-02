import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { cva, type VariantProps } from 'class-variance-authority';

const metricCardVariants = cva(
  'rounded-[20px] p-5 bg-card border overflow-hidden relative transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5',
  {
    variants: {
      color: {
        blue:     'border-info/15 hover:border-info/30',
        mint:     'border-success/15 hover:border-success/30',
        amber:    'border-warning/15 hover:border-warning/30',
        lavender: 'border-secondary/15 hover:border-secondary/30',
        rose:     'border-danger/15 hover:border-danger/30',
        indigo:   'border-[#3F51B5]/15 hover:border-[#3F51B5]/30',
        teal:     'border-[#009688]/15 hover:border-[#009688]/30',
        orange:   'border-[#E65100]/15 hover:border-[#E65100]/30',
        cream:    'border-border hover:border-border-strong',
        gold:     'border-gold/30 hover:border-gold/50',
      },
    },
    defaultVariants: {
      color: 'cream',
    },
  }
);

const ICON_BG_COLORS: Record<string, string> = {
  blue:     'bg-info/10 text-info',
  mint:     'bg-success/10 text-success',
  amber:    'bg-warning/10 text-warning',
  lavender: 'bg-secondary/10 text-secondary',
  rose:     'bg-danger/10 text-danger',
  indigo:   'bg-[#3F51B5]/10 text-[#3F51B5]',
  teal:     'bg-[#009688]/10 text-[#009688]',
  orange:   'bg-[#E65100]/10 text-[#E65100]',
  cream:    'bg-primary/5 text-primary',
  gold:     'bg-gold/15 text-[#B8860B]',
};

export interface MetricCardProps
  extends Omit<HTMLMotionProps<'div'>, 'ref' | 'color'>,
    VariantProps<typeof metricCardVariants> {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: React.ReactNode;
  active?: boolean;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ className, color, title, value, icon, trend, active = false, ...props }, ref) => {
    const iconStyle = ICON_BG_COLORS[color ?? 'cream'] ?? 'bg-primary/5 text-primary';

    return (
      <motion.div
        ref={ref}
        className={cn(
          metricCardVariants({ color }),
          active && 'ring-2 ring-offset-2 ring-secondary/40',
          className
        )}
        {...props}
      >
        <div className="flex flex-col h-full justify-between relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className={cn(
              'flex items-center justify-center w-11 h-11 rounded-[14px] shadow-sm transition-colors duration-300',
              iconStyle
            )}>
              {icon}
            </div>
            {trend && (
              <div className="text-[11px] font-bold text-text-muted bg-surface-2 px-2.5 py-1 rounded-full border border-border tracking-wide uppercase shadow-xs">
                {trend}
              </div>
            )}
          </div>

          <div>
            <div className={cn('text-[32px] font-display font-bold leading-none mb-1.5 tracking-tight text-primary')}>
              {value}
            </div>
            <div className="text-xs font-bold text-text-muted uppercase tracking-wider leading-tight">
              {title}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);
MetricCard.displayName = 'MetricCard';
