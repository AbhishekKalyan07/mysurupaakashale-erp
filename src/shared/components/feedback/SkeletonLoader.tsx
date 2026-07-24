import { cn } from '@/shared/lib/cn';

// ── Primitive: a single shimmer bar ───────────────────────────────────────────
function Shimmer({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} />;
}

// ── Card Skeleton ─────────────────────────────────────────────────────────────
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-xl border border-rice-200 bg-rice-25 p-5 shadow-card', className)}
      role="status"
      aria-label="Loading card"
    >
      <Shimmer className="h-4 w-1/3 mb-4" />
      <Shimmer className="h-8 w-1/2 mb-2" />
      <Shimmer className="h-3 w-full mb-1.5" />
      <Shimmer className="h-3 w-4/5" />
    </div>
  );
}

// ── Dashboard Cards Row Skeleton ──────────────────────────────────────────────
export function DashboardCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading dashboard">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-rice-200 bg-rice-25 p-5 shadow-card"
        >
          <div className="flex items-center justify-between mb-4">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-8 w-8 rounded-lg" />
          </div>
          <Shimmer className="h-7 w-32 mb-2" />
          <Shimmer className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Table Skeleton ────────────────────────────────────────────────────────────
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="rounded-xl border border-rice-200 bg-rice-25 shadow-card overflow-hidden"
      role="status"
      aria-label="Loading table"
    >
      {/* Header */}
      <div className="bg-rice-50 border-b border-rice-200 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className={cn('h-3', i === 0 ? 'w-32' : 'flex-1')} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className="flex items-center gap-4 px-4 py-4 border-b border-rice-100 last:border-0"
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <Shimmer
              key={ci}
              className={cn(
                'h-3.5',
                ci === 0 ? 'w-36' : ci === cols - 1 ? 'w-16 ml-auto' : 'flex-1',
              )}
            />
          ))}
        </div>
      ))}
      {/* Footer */}
      <div className="bg-rice-50 border-t border-rice-200 px-4 py-3">
        <Shimmer className="h-3 w-32" />
      </div>
    </div>
  );
}

// ── Form Skeleton ─────────────────────────────────────────────────────────────
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div
      className="space-y-5 max-w-lg"
      role="status"
      aria-label="Loading form"
    >
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Shimmer className="h-10 w-32 rounded-lg mt-4" />
    </div>
  );
}

// ── Chart Skeleton ────────────────────────────────────────────────────────────
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-rice-200 bg-rice-25 p-5 shadow-card',
        className,
      )}
      role="status"
      aria-label="Loading chart"
    >
      <Shimmer className="h-4 w-40 mb-1" />
      <Shimmer className="h-3 w-24 mb-6" />
      {/* Fake bars */}
      <div className="flex items-end gap-2 h-40">
        {[60, 80, 45, 90, 70, 55, 85, 65, 75, 50].map((h, i) => (
          <Shimmer
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ height: `${h}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="flex justify-between mt-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-2.5 w-10" />
        ))}
      </div>
    </div>
  );
}

// ── List Skeleton ─────────────────────────────────────────────────────────────
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div
      className="rounded-xl border border-rice-200 bg-rice-25 shadow-card divide-y divide-rice-100"
      role="status"
      aria-label="Loading list"
    >
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Shimmer className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3.5 w-1/3" />
            <Shimmer className="h-3 w-2/3" />
          </div>
          <Shimmer className="h-7 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── Page/Section Skeleton (full-page loading) ─────────────────────────────────
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading page">
      {/* Header */}
      <div className="space-y-2">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-7 w-48" />
      </div>
      <DashboardCardsSkeleton count={3} />
      <TableSkeleton rows={5} />
    </div>
  );
}
