import { AlertTriangle, Trash2, X } from "lucide-react";
import { useId, useRef } from "react";
import { PremiumButton as Button } from "./PremiumButton";
import { cn } from "@/shared/lib/cn";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import { useFocusTrap } from "@/shared/hooks/useFocusTrap";

export interface ConfirmDeleteDialogProps {
  /** Label for the entity being deleted, e.g. "customer", "order", "menu" */
  entityLabel?: string;
  /** Optional display name of the specific item, e.g. "Abhishek K" */
  entityName?: string;
  /** Custom description override */
  description?: string;
  /** Label for the danger confirm button. Defaults to "Delete" */
  confirmLabel?: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra classes for the dialog panel */
  className?: string;
}

/**
 * Reusable delete confirmation dialog with danger styling.
 * Fully accessible: traps focus, closes on Escape, has aria-modal.
 *
 * Usage:
 * ```tsx
 * {showDelete && (
 *   <ConfirmDeleteDialog
 *     entityLabel="customer"
 *     entityName={customer.fullName}
 *     isDeleting={deleteMutation.isPending}
 *     onConfirm={() => deleteMutation.mutate(customer.id)}
 *     onCancel={() => setShowDelete(false)}
 *   />
 * )}
 * ```
 */
export function ConfirmDeleteDialog({
  entityLabel = "item",
  entityName,
  description,
  confirmLabel = "Delete",
  isDeleting = false,
  onConfirm,
  onCancel,
  className,
}: ConfirmDeleteDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useScrollLock(true);
  useFocusTrap(panelRef, true, {
    onEscape: onCancel,
    initialFocusRef: cancelRef,
  });

  const defaultDescription = entityName
    ? `Are you sure you want to delete the ${entityLabel} "${entityName}"? This action cannot be undone.`
    : `Are you sure you want to delete this ${entityLabel}? This action cannot be undone.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-safe"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-rice-200 p-6",
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle">
              <Trash2 size={18} className="text-danger" />
            </div>
            <h2
              id={titleId}
              className="font-display text-lg font-bold text-ink-900"
            >
              Delete{" "}
              {entityLabel
                ? entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)
                : "Item"}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-ink-500 hover:text-ink-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-3 rounded-lg bg-danger-subtle border border-danger/20 px-3 py-3 mb-5">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
          <p
            id={descId}
            className="text-sm text-ink-700 leading-relaxed"
          >
            {description ?? defaultDescription}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            ref={cancelRef}
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={onConfirm}
            isLoading={isDeleting}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
