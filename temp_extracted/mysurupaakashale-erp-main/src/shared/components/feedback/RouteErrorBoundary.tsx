import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('[RouteErrorBoundary]', error);

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred while loading this page.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message || 'The page you requested could not be found or loaded.';
  } else if (error instanceof Error) {
    message = error.message;
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
