import * as Sentry from '@sentry/react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  role?: string;
  route?: string;
  [key: string]: any;
}

const isDev = import.meta.env.DEV;

function getBrowserInfo() {
  if (typeof window === 'undefined') return 'unknown';
  return navigator.userAgent;
}

/**
 * Filter sensitive information from logs before sending to Sentry or console.
 */
function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;
  
  const sanitized = { ...context };
  const sensitiveKeys = ['password', 'token', 'payment', 'credit_card', 'cvv', 'secret'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

function formatLogMessage(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message} ${context ? JSON.stringify(context) : ''}`;
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (!isDev) return; // Debug logs only in development
    const sanitized = sanitizeContext(context);
    console.debug(formatLogMessage('debug', message, sanitized));
  },
  
  info: (message: string, context?: LogContext) => {
    const sanitized = sanitizeContext(context);
    console.info(formatLogMessage('info', message, sanitized));
    if (!isDev) {
      Sentry.addBreadcrumb({
        category: 'log',
        message: message,
        level: 'info',
        data: sanitized
      });
    }
  },
  
  warn: (message: string, context?: LogContext) => {
    const sanitized = sanitizeContext(context);
    console.warn(formatLogMessage('warn', message, sanitized));
    if (!isDev) {
      Sentry.captureMessage(message, {
        level: 'warning',
        extra: { ...sanitized, browser: getBrowserInfo() }
      });
    }
  },
  
  error: (error: Error | string, context?: LogContext) => {
    const sanitized = sanitizeContext(context);
    const message = typeof error === 'string' ? error : error.message;
    console.error(formatLogMessage('error', message, sanitized), error);
    
    if (!isDev) {
      // Ignore expected Firebase permission denied errors if needed
      if (typeof error === 'object' && error !== null && 'code' in (error as any)) {
        if ((error as any).code === 'permission-denied') {
          // Do not send to Sentry to reduce noise
          return;
        }
      }
      
      Sentry.captureException(error, {
        extra: { ...sanitized, browser: getBrowserInfo() }
      });
    }
  },
  
  setUser: (userId: string | null, role?: string) => {
    if (userId) {
      Sentry.setUser({ id: userId, role });
    } else {
      Sentry.setUser(null);
    }
  }
};
