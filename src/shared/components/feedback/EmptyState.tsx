import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Primary action (e.g. "Create First Customer" button) */
  action?: ReactNode;
  /** Optional secondary action (e.g. "Import from CSV" link) */
  secondaryAction?: ReactNode;
  /** Small generic icon wrapped in a circular background */
  icon?: ReactNode;
  /** Large full-size SVG illustration. Do not use with `icon`. */
  illustration?: ReactNode;
}

/** An empty screen is an invitation to act, not just an absence — always pair with a next step where one exists. */
export function EmptyState({ title, description, action, secondaryAction, icon, illustration }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-rice-300 bg-rice-50/50 px-6 py-14 text-center transition-all hover:bg-rice-50">
      {illustration && <div className="mb-2">{illustration}</div>}
      {icon && !illustration && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rice-100 text-ink-500">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-sm">
        <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
        {description && <p className="text-sm text-ink-500 leading-relaxed">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-col sm:flex-row items-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

