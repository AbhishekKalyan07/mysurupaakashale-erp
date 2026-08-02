import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PremiumInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const PremiumInput = forwardRef<HTMLInputElement, PremiumInputProps>(
  ({ className, label, error, helperText, icon, trailingIcon, disabled, id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-text-secondary leading-tight">
            {label}
            {required && (
              <span className="ml-0.5 text-danger" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <div className="relative w-full">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              'w-full h-12 rounded-[14px] border border-border bg-surface px-4 text-sm text-text',
              'shadow-xs transition-all duration-150 placeholder:text-text-faint',
              'focus:border-secondary/60 focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:shadow-sm',
              'hover:border-border-strong',
              icon && 'pl-10',
              trailingIcon && 'pr-10',
              error && 'border-danger/60 focus:border-danger focus:ring-danger/20',
              disabled && 'cursor-not-allowed opacity-50 bg-surface-2',
              className
            )}
            {...props}
          />
          {trailingIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {trailingIcon}
            </div>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-danger flex items-center gap-1">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-xs text-text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
PremiumInput.displayName = 'PremiumInput';
