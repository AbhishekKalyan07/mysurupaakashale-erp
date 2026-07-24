import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

/** An empty screen is an invitation to act, not just an absence — always pair with a next step where one exists. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-rice-300 bg-rice-50/50 px-6 py-14 text-center transition-all hover:bg-rice-50">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rice-100 text-ink-400">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-sm">
        <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
        {description && <p className="text-sm text-ink-500 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
