import { LeafSpinner } from '../ui/LeafSpinner';

export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-rice-50">
      <LeafSpinner size={40} className="text-leaf-600" />
      <p className="text-sm text-ink-500">Loading…</p>
    </div>
  );
}
