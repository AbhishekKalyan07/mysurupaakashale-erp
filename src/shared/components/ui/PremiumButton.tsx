import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { LeafSpinner } from './LeafSpinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-primary to-secondary text-white shadow-md hover:shadow-hover hover:shadow-gold/20 hover:-translate-y-0.5',
        secondary:
          'bg-white text-primary border border-gold/50 shadow-sm hover:shadow-md hover:border-gold hover:-translate-y-0.5',
        ghost: 'bg-transparent text-primary hover:bg-background',
        danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm hover:shadow-md hover:-translate-y-0.5',
      },
      size: {
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

// We extend motion.button props to allow framer-motion props
export interface PremiumButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'ref'>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const PremiumButton = forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        whileHover={disabled || isLoading ? {} : { scale: 1.02 }}
        whileTap={disabled || isLoading ? {} : { scale: 0.98 }}
        {...props}
      >
        {isLoading && <LeafSpinner size={16} className="shrink-0" />}
        {children as any}
      </motion.button>
    );
  }
);
PremiumButton.displayName = 'PremiumButton';
