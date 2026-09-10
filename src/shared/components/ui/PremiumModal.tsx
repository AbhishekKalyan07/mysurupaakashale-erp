import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function PremiumModal({
  isOpen,
  onClose,
  title,
  children,
  className,
}: PremiumModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
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
          <h2 className="font-display text-xl font-bold text-ink-900">
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
