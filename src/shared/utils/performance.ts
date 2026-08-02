import { trace } from 'firebase/performance';
import { initPerformance } from '@/shared/lib/firebase';

export const PerformanceTraces = {
  DASHBOARD_LOAD: 'dashboard_load_time',
  LOGIN: 'login_duration',
  ROUTE_NAVIGATION: 'route_navigation',
  FIRESTORE_READ: 'firestore_read_time',
  FIRESTORE_WRITE: 'firestore_write_time',
  STORAGE_UPLOAD: 'storage_upload_time',
  STORAGE_DOWNLOAD: 'storage_download_time',
  NETWORK_REQUEST: 'network_request',
  COLD_START: 'cold_start',
  LCP: 'largest_contentful_paint'
} as const;

type TraceName = typeof PerformanceTraces[keyof typeof PerformanceTraces] | (string & {});

/**
 * Start a custom trace.
 * Returns an object with a stop() method to end the trace.
 */
export async function startCustomTrace(name: TraceName) {
  const perf = await initPerformance();
  if (!perf) {
    return {
      putMetric: () => {},
      putAttribute: () => {},
      stop: () => {}
    };
  }

  const t = trace(perf, name);
  t.start();
  return t;
}

/**
 * Wrap a promise with a trace that automatically starts and stops.
 */
export async function withTrace<T>(name: TraceName, promise: Promise<T>): Promise<T> {
  const t = await startCustomTrace(name);
  try {
    return await promise;
  } finally {
    t.stop();
  }
}
