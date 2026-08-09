import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';
import { LeafSpinner } from './LeafSpinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-primary to-secondary text-white rounded-[14px] shadow-sm hover:shadow-md hover:shadow-secondary/20 hover:-translate-y-px active:translate-y-0',
        secondary:
          'bg-surface text-primary border border-border-strong rounded-[14px] shadow-xs hover:border-secondary/50 hover:bg-pastel-lavender hover:-translate-y-px active:translate-y-0',
        tonal:
          'bg-pastel-lavender text-primary border border-secondary/20 rounded-[14px] hover:bg-secondary/15 hover:-translate-y-px active:translate-y-0',
        ghost:
          'bg-transparent text-primary rounded-[14px] hover:bg-surface-2 active:bg-surface-3',
        danger:
          'bg-danger text-white rounded-[14px] shadow-sm hover:bg-danger/90 hover:-translate-y-px active:translate-y-0',
        'danger-tonal':
          'bg-danger-subtle text-danger border border-danger/20 rounded-[14px] hover:bg-danger/15',
        success:
          'bg-success text-white rounded-[14px] shadow-sm hover:bg-success/90 hover:-translate-y-px',
        'success-tonal':
          'bg-success-subtle text-success border border-success/20 rounded-[14px] hover:bg-success/15',
        warning:
          'bg-warning text-white rounded-[14px] shadow-sm hover:bg-warning/90 hover:-translate-y-px',
        'warning-tonal':
          'bg-warning-subtle text-warning border border-warning/20 rounded-[14px] hover:bg-warning/15',
      },
      size: {
        xs: 'h-8 px-3 text-xs gap-1',
        sm: 'h-9 px-3.5 text-sm gap-1.5',
        md: 'h-11 px-5 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2',
        xl: 'h-14 px-8 text-base gap-2.5',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-lg': 'h-12 w-12 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface PremiumButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const PremiumButton = forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }), 'active:scale-95')}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <LeafSpinner size={15} className="shrink-0" />}
        {children}
      </button>
    );
  }
);
PremiumButton.displayName = 'PremiumButton';
