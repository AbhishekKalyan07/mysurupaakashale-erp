import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';

export interface PremiumCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  hoverLift?: boolean;
  elevated?: boolean;
}

export const PremiumCard = forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, hoverLift = false, elevated = false, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'bg-card rounded-[20px] border border-border/80 overflow-hidden',
          elevated ? 'shadow-lg border-border-strong' : 'shadow-md',
          hoverLift && 'transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-border-strong cursor-pointer',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
PremiumCard.displayName = 'PremiumCard';
