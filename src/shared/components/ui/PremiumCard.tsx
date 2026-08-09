import { forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverLift?: boolean;
  elevated?: boolean;
}

export const PremiumCard = forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, hoverLift = false, elevated = false, children, ...props }, ref) => {
    return (
      <div
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
      </div>
    );
  }
);
PremiumCard.displayName = 'PremiumCard';
