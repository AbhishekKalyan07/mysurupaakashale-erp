import { Component, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

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
