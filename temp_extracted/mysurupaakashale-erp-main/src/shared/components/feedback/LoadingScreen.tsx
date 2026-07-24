import { LeafSpinner } from '../ui/LeafSpinner';

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-white shadow-sm border border-rice-200">
        <LeafSpinner size={28} className="text-leaf-600 animate-spin" />
        <div className="absolute inset-0 rounded-2xl border-2 border-leaf-100 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-ink-500 animate-pulse">{message}</p>
    </div>
  );
}
