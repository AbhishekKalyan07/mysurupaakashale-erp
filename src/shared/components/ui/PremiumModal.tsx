import { useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import { useFocusTrap } from "@/shared/hooks/useFocusTrap";

export interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function PremiumModal({
  isOpen,
  onClose,
  title,
  children,
  className,
  initialFocusRef,
}: PremiumModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useScrollLock(isOpen);
  useFocusTrap(panelRef, isOpen, {
    onEscape: onClose,
    initialFocusRef,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full max-w-md rounded-2xl bg-white shadow-2xl border border-rice-200 p-6",
          className,
        )}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 id={titleId} className="font-display text-xl font-bold text-ink-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
