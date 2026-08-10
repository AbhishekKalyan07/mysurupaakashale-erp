import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { PremiumCard as Card } from '../ui/PremiumCard';
import { PremiumButton as Button } from '../ui/PremiumButton';

export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('[RouteErrorBoundary]', error);

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred while loading this page.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message || 'The page you requested could not be found or loaded.';
  } else if (error instanceof Error) {
    message = (error as Error).message;
    
    // Automatically reload on chunk load errors (Vite dynamic import failures)
    const isChunkLoadError = message?.includes('Failed to fetch dynamically imported module') ||
                             message?.includes('Importing a module script failed');
                             
    if (isChunkLoadError) {
      const reloadKey = 'app-reloaded-from-chunk-error';
      let hasReloaded = false;
      try {
        hasReloaded = sessionStorage.getItem(reloadKey) === 'true';
      } catch { /* ignore */ }
      
      if (!hasReloaded) {
        try { sessionStorage.setItem(reloadKey, 'true'); } catch { /* ignore */ }
        window.location.reload();
      } else {
        try { sessionStorage.removeItem(reloadKey); } catch { /* ignore */ }
      }
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center shadow-lg border-danger-subtle">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <ShieldAlert size={32} />
        </div>
        <h2 className="mb-2 font-display text-xl font-semibold text-leaf-900">
          {title}
        </h2>
        <p className="mb-6 text-sm text-leaf-600">{message}</p>
        <div className="flex justify-center gap-4">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
          <Button onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
        </div>
      </Card>
    </div>
  );
}
