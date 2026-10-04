import React, { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  id?: string;
  name?: string;
  unitLabel?: string;
}

/**
 * Clean, accessible, mobile-friendly numeric stepper.
 * Guarantees integer-only values between [min, max], preventing NaN, negatives, decimals, or empty states.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
  className = "",
  size = "md",
  id,
  name,
  unitLabel,
}: QuantityStepperProps) {
  // Safe integer clamped to [min, max]
  const safeValue = Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : min;

  const [textValue, setTextValue] = useState<string>(String(safeValue));

  useEffect(() => {
    setTextValue(String(safeValue));
  }, [safeValue]);

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || safeValue <= min) return;
    const next = safeValue - 1;
    onChange(next);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || safeValue >= max) return;
    const next = safeValue + 1;
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty string temporarily so user can backspace and type
    if (raw === "") {
      setTextValue("");
      return;
    }

    // Strip non-digit characters to strictly disallow decimals, exponents, or negatives
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly === "") {
      setTextValue("");
      return;
    }

    const parsed = parseInt(digitsOnly, 10);
    if (!Number.isFinite(parsed)) {
      setTextValue(String(min));
      onChange(min);
      return;
    }

    const clamped = Math.max(min, Math.min(max, parsed));
    setTextValue(digitsOnly);
    onChange(clamped);
  };

  const handleBlur = () => {
    if (textValue === "" || isNaN(Number(textValue))) {
      setTextValue(String(min));
      onChange(min);
    } else {
      const parsed = parseInt(textValue.replace(/\D/g, ""), 10);
      const clamped = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : min));
      setTextValue(String(clamped));
      onChange(clamped);
    }
  };

  const sizeClasses = {
    sm: "h-8 text-xs",
    md: "h-10 text-sm",
    lg: "h-12 text-base",
  }[size];

  const buttonSizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  }[size];

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div
        className={`inline-flex items-center rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary ${
          disabled ? "opacity-50 cursor-not-allowed bg-surface-1" : ""
        }`}
      >
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || safeValue <= min}
          aria-label="Decrease quantity"
          className={`${buttonSizeClasses} flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-1 active:bg-surface-2 rounded-l-xl transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed touch-manipulation`}
        >
          <Minus size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
        </button>

        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={textValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label="Quantity"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={safeValue}
          className={`${sizeClasses} w-14 text-center font-mono font-bold bg-transparent text-text border-x border-border/40 focus:outline-hidden selection:bg-primary/20`}
        />

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || safeValue >= max}
          aria-label="Increase quantity"
          className={`${buttonSizeClasses} flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-1 active:bg-surface-2 rounded-r-xl transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed touch-manipulation`}
        >
          <Plus size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />
        </button>
      </div>

      {unitLabel && (
        <span className="text-xs font-medium text-text-muted select-none">
          {safeValue === 1 ? unitLabel : `${unitLabel}s`}
        </span>
      )}
    </div>
  );
}
