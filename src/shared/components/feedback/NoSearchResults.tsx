import { Search } from 'lucide-react';
import { PremiumButton as Button } from '../ui/PremiumButton';

export interface NoSearchResultsProps {
  query?: string;
  description?: string;
  onClear?: () => void;
}

/**
 * Shown in searchable tables/lists when the current query returns 0 results.
 * Always pair with an `onClear` callback so the user has a way out.
 */
export function NoSearchResults({
  query,
  description,
  onClear,
}: NoSearchResultsProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-rice-300 bg-rice-50/50 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rice-200 text-ink-400">
        <Search size={24} strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="font-display text-lg font-semibold text-ink-900">
          No results found
        </p>
        <p className="text-sm text-ink-500 leading-relaxed">
          {description ??
            (query
              ? `We couldn't find anything matching "${query}". Try a different search term.`
              : 'Your search returned no results. Try different keywords or filters.')}
        </p>
      </div>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="mt-1">
          Clear search
        </Button>
      )}
    </div>
  );
}
