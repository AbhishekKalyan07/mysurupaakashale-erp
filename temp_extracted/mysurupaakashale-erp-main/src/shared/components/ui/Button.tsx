import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { LeafSpinner } from './LeafSpinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-leaf-700 text-rice-25 hover:bg-leaf-800 active:bg-leaf-900 disabled:bg-leaf-300',
  secondary:
    'bg-turmeric-400 text-leaf-900 hover:bg-turmeric-500 active:bg-turmeric-600 disabled:bg-turmeric-100 disabled:text-ink-400',
  ghost: 'bg-transparent text-leaf-700 hover:bg-leaf-50 active:bg-leaf-100 disabled:text-ink-400',
  danger: 'bg-danger text-rice-25 hover:bg-tamarind-700 disabled:bg-danger-subtle disabled:text-ink-400',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

/**
 * The one Button every feature reuses — new variants/sizes get added here,
 * never redefined ad hoc in a feature folder (that's how "no duplicate
 * code" holds up once five role-dashboards are all shipping UI).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {isLoading && <LeafSpinner size={16} className="shrink-0" />}
      {children}
    </button>
  );
});
