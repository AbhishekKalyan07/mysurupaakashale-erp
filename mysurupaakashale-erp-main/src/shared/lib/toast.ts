import hotToast, { type ToastOptions } from 'react-hot-toast';

const DEFAULT_OPTIONS: ToastOptions = {
  duration: 4000,
  position: 'top-right',
  style: {
    borderRadius: '12px',
    background: 'white',
    color: '#0f172a', // ink-900
    border: '1px solid #e2e8f0', // rice-200
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  },
};

/**
 * Standardized toast notification service.
 * Use this instead of importing `toast` directly from `react-hot-toast`
 * to ensure consistent styling and duration across the app.
 */
export const toast = {
  success: (message: string, options?: ToastOptions) =>
    hotToast.success(message, {
      ...DEFAULT_OPTIONS,
      iconTheme: { primary: '#10b981', secondary: '#fff' }, // success color
      ...options,
    }),

  error: (message: string, options?: ToastOptions) =>
    hotToast.error(message, {
      ...DEFAULT_OPTIONS,
      iconTheme: { primary: '#ef4444', secondary: '#fff' }, // danger color
      duration: 6000, // Show errors slightly longer
      ...options,
    }),

  /** Generic info toast */
  info: (message: string, options?: ToastOptions) =>
    hotToast(message, {
      ...DEFAULT_OPTIONS,
      icon: 'ℹ️',
      ...options,
    }),

  /** Warning toast */
  warning: (message: string, options?: ToastOptions) =>
    hotToast(message, {
      ...DEFAULT_OPTIONS,
      icon: '⚠️',
      ...options,
    }),

  /**
   * Promise toast for async operations
   * @example toast.promise(saveData(), { loading: 'Saving...', success: 'Saved!', error: 'Failed' })
   */
  promise: hotToast.promise,

  /** Dismiss a specific toast or all toasts if no ID is provided */
  dismiss: hotToast.dismiss,
};
