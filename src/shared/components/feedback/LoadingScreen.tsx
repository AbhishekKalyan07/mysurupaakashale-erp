import { LeafSpinner } from '../ui/LeafSpinner';

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 py-12">
      <div className="relative flex items-center justify-center h-20 w-20 rounded-3xl bg-surface-1 shadow-md border border-border/80">
        <div className="absolute inset-0 rounded-3xl border-2 border-secondary/30 animate-ping opacity-25" />
        <img
          src="/pwa_gold.png"
          alt="Loading..."
          className="h-14 w-14 object-contain rounded-full animate-pulse"
        />
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-sm">
          <LeafSpinner size={16} className="animate-spin" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-display font-semibold text-text animate-pulse">{message}</p>
        <span className="text-[11px] font-sans text-text-muted">Mysuru Paakashale</span>
      </div>
    </div>
  );
}
