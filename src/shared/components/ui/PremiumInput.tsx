import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PremiumInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const PremiumInput = forwardRef<HTMLInputElement, PremiumInputProps>(
  ({ className, label, error, helperText, icon, disabled, id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-primary">
            {label}
            {required && (
              <span className="ml-0.5 text-danger" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <div className="relative w-full">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
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
              'w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-text shadow-sm transition-all duration-200 placeholder:text-text-muted/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20',
              icon && 'pl-10',
              error && 'border-danger focus:border-danger focus:ring-danger/20',
              disabled && 'cursor-not-allowed opacity-60 bg-background',
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-sm text-text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
PremiumInput.displayName = 'PremiumInput';
