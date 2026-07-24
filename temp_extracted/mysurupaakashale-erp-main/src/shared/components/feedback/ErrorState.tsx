import { Button } from '../ui/Button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/** Errors state plainly what happened and how to recover — never vague, never apologetic in tone. */
export function ErrorState({ title = 'Something went wrong', description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-danger-subtle bg-danger-subtle px-6 py-10 text-center">
      <p className="font-medium text-danger">{title}</p>
      {description && <p className="text-sm text-ink-600">{description}</p>}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
