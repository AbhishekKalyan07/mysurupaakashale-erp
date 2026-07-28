import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';

export interface PremiumCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  hoverLift?: boolean;
}

export const PremiumCard = forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, hoverLift = false, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'bg-card rounded-[24px] border border-gold/20 shadow-sm p-6 overflow-hidden',
          hoverLift && 'transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-gold/40',
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
