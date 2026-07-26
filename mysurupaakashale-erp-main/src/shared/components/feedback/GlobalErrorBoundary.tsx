import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
    
    // Automatically reload on chunk load errors (Vite dynamic import failures)
    // We use sessionStorage to prevent infinite reload loops if the chunk is permanently gone.
    const isChunkLoadError = (error as Error).message?.includes('Failed to fetch dynamically imported module') ||
                             (error as Error).message?.includes('Importing a module script failed');
                             
    if (isChunkLoadError) {
      const reloadKey = 'app-reloaded-from-chunk-error';
      const hasReloaded = sessionStorage.getItem(reloadKey);
      
      if (!hasReloaded) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      } else {
        // If already reloaded once and still failing, clear the flag and show error UI
        sessionStorage.removeItem(reloadKey);
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-rice-50 p-6 text-center">
          <div className="flex max-w-md flex-col items-center rounded-2xl bg-white p-8 shadow-sm border border-rice-200">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-chili-50 text-chili-600">
              <AlertCircle size={32} />
            </div>
            <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">Something went wrong</h2>
            <p className="mb-6 text-sm text-ink-500">
              We encountered an unexpected error while loading this page. 
              {this.state.error && (
                <span className="mt-2 block rounded bg-rice-100 p-2 font-mono text-xs text-ink-700">
                  {this.state.error.message}
                </span>
              )}
            </p>
            <Button onClick={this.handleReload} className="w-full">
              <RefreshCw size={18} className="mr-2" />
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
