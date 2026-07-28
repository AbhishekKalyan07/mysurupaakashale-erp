import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { GoldDivider } from './decorations/GoldDivider';
import { cva, type VariantProps } from 'class-variance-authority';

const metricCardVariants = cva(
  'rounded-[24px] p-6 shadow-sm border border-gold/10 overflow-hidden relative transition-all duration-300',
  {
    variants: {
      color: {
        blue: 'bg-gradient-to-br from-white to-pastel-blue',
        mint: 'bg-gradient-to-br from-white to-pastel-mint',
        amber: 'bg-gradient-to-br from-white to-pastel-amber',
        lavender: 'bg-gradient-to-br from-white to-pastel-lavender',
        rose: 'bg-gradient-to-br from-white to-pastel-rose',
        cream: 'bg-gradient-to-br from-white to-background',
      },
    },
    defaultVariants: {
      color: 'cream',
    },
  }
);

export interface MetricCardProps
  extends Omit<HTMLMotionProps<'div'>, 'ref' | 'color'>,
    VariantProps<typeof metricCardVariants> {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: React.ReactNode;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ className, color, title, value, icon, trend, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(metricCardVariants({ color }), 'hover:shadow-md hover:-translate-y-1 hover:border-gold/30', className)}
        {...props}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-sm text-primary">
            {icon}
          </div>
          {trend && (
            <div className="text-sm font-medium">
              {trend}
            </div>
          )}
        </div>
        
        <GoldDivider className="mb-4 opacity-30" />
        
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-1">{title}</h3>
          <div className="text-3xl font-display font-bold text-text">{value}</div>
        </div>
      </motion.div>
    );
  }
);
MetricCard.displayName = 'MetricCard';
