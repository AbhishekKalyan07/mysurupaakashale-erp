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
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-rice-300 bg-rice-25 px-6 py-12 text-center">
      {icon}
      <div className="space-y-1">
        <p className="font-display text-lg text-ink-900">{title}</p>
        {description && <p className="text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
