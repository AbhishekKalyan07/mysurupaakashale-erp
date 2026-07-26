import type { ErrorInfo } from 'react';

export interface ErrorLogContext {
  componentStack?: string;
  [key: string]: unknown;
}

/**
 * Single place every uncaught error funnels through. When a real
 * error-tracking service (Sentry, Firebase Crashlytics, etc.) is chosen,
 * only this function's body needs to change — every caller already routes
 * through here instead of calling `console.error` directly. Wiring a
 * specific vendor SDK before one is chosen would be exactly the kind of
 * premature integration this project avoids, so this stays a plain,
 * fully-functional console logger until that decision is made.
 */
export function logError(error: Error, context?: ErrorLogContext): void {
  console.error('[error]', error, context ?? '');
}

/** Adapts a React ErrorInfo (from componentDidCatch) into the shape logError expects. */
export function errorInfoToContext(errorInfo: ErrorInfo): ErrorLogContext {
  return { componentStack: errorInfo.componentStack ?? undefined };
}
