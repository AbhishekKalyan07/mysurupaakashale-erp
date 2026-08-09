import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface PremiumTableProps {
  columns: string[];
  children: ReactNode;
  isEmpty?: boolean;
  emptyState?: ReactNode;
  isLoading?: boolean;
  className?: string;
}

export function PremiumTable({
  columns,
  children,
  isEmpty,
  emptyState,
  isLoading,
  className,
}: PremiumTableProps) {
  return (
    <div
      className={cn(
        'w-full bg-white rounded-3xl border border-gold/20 shadow-sm overflow-hidden',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-background border-b border-gold/20 text-text-muted">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-6 py-4 text-sm font-semibold whitespace-nowrap sticky top-0 bg-background z-10"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {isLoading ? (
              // Skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((_, j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 bg-beige rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isEmpty ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  {emptyState || (
                    <div className="text-text-muted">No data available</div>
                  )}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PremiumTableRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-background/50',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function PremiumTableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn('px-6 py-4 text-sm text-text', className)}>
      {children}
    </td>
  );
}
