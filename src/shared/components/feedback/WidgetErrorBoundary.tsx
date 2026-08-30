import { Component, type ReactNode, type ErrorInfo } from 'react';
import { ErrorState } from './ErrorState';
import { logger } from '@/shared/utils/logger';

export interface WidgetErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Component-level boundary to prevent one widget from crashing an entire page.
 */
export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(error, { componentStack: errorInfo.componentStack, boundary: 'WidgetErrorBoundary' });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title={this.props.fallbackTitle ?? 'Widget failed to load'}
          description={
            this.props.fallbackDescription ??
            this.state.error?.message ??
            'An unexpected error occurred in this component.'
          }
          onRetry={() => this.setState({ hasError: false, error: undefined })}
        />
      );
    }

    return this.props.children;
  }
}
