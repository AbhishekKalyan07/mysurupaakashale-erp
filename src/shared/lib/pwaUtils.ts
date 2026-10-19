/**
 * PWA & Service Worker Lifecycle Utilities
 *
 * Provides targeted, idempotent cleanup for obsolete legacy service workers
 * (e.g., /service-worker.js) while strictly protecting the active /sw.js worker
 * and preserving offline caches.
 */

export interface ServiceWorkerRegistrationLike {
  active?: { scriptURL: string } | null;
  waiting?: { scriptURL: string } | null;
  installing?: { scriptURL: string } | null;
  unregister: () => Promise<boolean>;
  update?: () => Promise<ServiceWorkerRegistration | void>;
}

/**
 * Determines whether a given script URL belongs to an obsolete legacy service worker.
 * Matches filenames such as /service-worker.js or service-worker.js, but strictly
 * excludes the active production service worker (/sw.js, sw.js).
 */
export function isLegacyServiceWorkerUrl(scriptURL: string): boolean {
  if (!scriptURL) return false;
  try {
    const parsed = new URL(scriptURL, "https://placeholder.local");
    const pathname = parsed.pathname;
    return pathname.endsWith("/service-worker.js") || pathname === "service-worker.js";
  } catch {
    return scriptURL.endsWith("/service-worker.js") || scriptURL === "service-worker.js";
  }
}

/**
 * Determines whether a service worker registration contains an obsolete legacy worker.
 */
export function isLegacyServiceWorkerRegistration(
  reg: Pick<ServiceWorkerRegistrationLike, "active" | "waiting" | "installing">
): boolean {
  const urls = [
    reg.active?.scriptURL,
    reg.waiting?.scriptURL,
    reg.installing?.scriptURL,
  ].filter((u): u is string => typeof u === "string" && u.length > 0);

  return urls.some(isLegacyServiceWorkerUrl);
}

/**
 * Narrowly scoped, idempotent cleanup of obsolete legacy service workers (e.g., /service-worker.js).
 * Preserves the active /sw.js worker and never touches caches or user data.
 *
 * @param getRegistrationsFn Optional injection for testing; defaults to navigator.serviceWorker.getRegistrations.
 * @returns Array of script URLs that were unregistered.
 */
export async function cleanupLegacyServiceWorkers(
  getRegistrationsFn?: () => Promise<readonly ServiceWorkerRegistrationLike[]>
): Promise<string[]> {
  const getRegs =
    getRegistrationsFn ||
    (typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof navigator.serviceWorker.getRegistrations === "function"
      ? () => navigator.serviceWorker.getRegistrations()
      : null);

  if (!getRegs) {
    return [];
  }

  try {
    const registrations = await getRegs();
    const unregisteredUrls: string[] = [];

    for (const reg of registrations) {
      if (isLegacyServiceWorkerRegistration(reg)) {
        const url =
          reg.active?.scriptURL ||
          reg.waiting?.scriptURL ||
          reg.installing?.scriptURL ||
          "unknown-legacy-sw";

        try {
          const success = await reg.unregister();
          if (success) {
            unregisteredUrls.push(url);
            console.info("[SW] Cleaned up obsolete legacy service worker:", url);
          }
        } catch (unregErr) {
          console.warn("[SW] Failed to unregister legacy service worker:", url, unregErr);
        }
      }
    }

    return unregisteredUrls;
  } catch (err) {
    console.warn("[SW] Error during legacy service worker cleanup:", err);
    return [];
  }
}

export interface ChunkRecoveryOptions {
  isOnline: boolean;
  lastReloadTimestamp: number | null;
  now?: number;
  throttleMs?: number;
  onLegacyCleanup?: () => Promise<unknown>;
  onTriggerUpdate?: () => Promise<unknown>;
  onReload?: () => void;
  onToast?: (message: string) => void;
}

export interface ChunkRecoveryResult {
  action: "offline-notified" | "reload-triggered" | "reload-throttled";
  newReloadTimestamp: number | null;
}

/**
 * Handles Vite chunk preload errors safely without reload loops,
 * unregistering the active worker, or clearing user caches.
 */
export async function handleChunkPreloadError(
  options: ChunkRecoveryOptions
): Promise<ChunkRecoveryResult> {
  const {
    isOnline,
    lastReloadTimestamp,
    now = Date.now(),
    throttleMs = 10000,
    onLegacyCleanup,
    onTriggerUpdate,
    onReload,
    onToast,
  } = options;

  if (!isOnline) {
    onToast?.("You are offline. Connect to the internet to open this page.");
    return { action: "offline-notified", newReloadTimestamp: lastReloadTimestamp };
  }

  const isThrottled =
    lastReloadTimestamp !== null && now - lastReloadTimestamp <= throttleMs;

  if (isThrottled) {
    onToast?.("A new update is available. Please refresh the page.");
    return { action: "reload-throttled", newReloadTimestamp: lastReloadTimestamp };
  }

  // First cleanup any obsolete legacy workers that might be misrouting requests
  if (onLegacyCleanup) {
    try {
      await onLegacyCleanup();
    } catch {
      // Non-fatal, continue with recovery
    }
  }

  // Trigger update check on active service worker if supported
  if (onTriggerUpdate) {
    try {
      await onTriggerUpdate();
    } catch {
      // Non-fatal, continue with recovery
    }
  }

  // Trigger safe reload
  if (onReload) {
    onReload();
  }

  return { action: "reload-triggered", newReloadTimestamp: now };
}
