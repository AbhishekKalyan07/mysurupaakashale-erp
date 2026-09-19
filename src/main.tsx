import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { GlobalErrorBoundary } from "./shared/components/feedback/GlobalErrorBoundary";
import "./index.css";
import { initAnalytics, initPerformance } from "./shared/lib/firebase";
import { registerSW } from "virtual:pwa-register";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!navigator.onLine) {
    import("react-hot-toast")
      .then(({ default: toast }) => {
        toast.error("You are offline. Connect to the internet to open this page.", {
          id: "offline-preload-error",
          duration: 5000,
        });
      })
      .catch(() => {
        console.warn("[Vite] Chunk preload failed: offline");
      });
    return;
  }

  // When online, chunk failed to load because a new release changed chunk hashes.
  // Throttle reloads via sessionStorage to break out of stale cache loop without infinite cycling.
  const lastReload = sessionStorage.getItem("pwa_last_preload_reload");
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem("pwa_last_preload_reload", now.toString());
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {})
        .finally(() => {
          window.location.reload();
        });
    } else {
      window.location.reload();
    }
  } else {
    import("react-hot-toast")
      .then(({ default: toast }) => {
        toast.error("A new update is available. Please refresh the page.", {
          id: "chunk-update-error",
          duration: 6000,
        });
      })
      .catch(() => {
        console.error("[Vite] Repeated chunk preload failure");
      });
  }
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html.");
}

function renderApplication() {
  createRoot(rootElement!).render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>,
  );
}

async function initSentryLazy() {
  try {
    const Sentry = await import("@sentry/react");
    const { useEffect } = await import("react");
    const {
      createRoutesFromChildren,
      matchRoutes,
      useLocation,
      useNavigationType,
    } = await import("react-router-dom");

    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      ignoreErrors: [
        // Firebase / IndexedDB internal noise
        /Connection is closing because of: Force close delete origin/i,
        /The transaction was aborted, so the request cannot be fulfilled/i,
        /IndexedDB persistence is only available on platforms that support LocalStorage/i,
        /QuotaExceededError/i,
        /IndexedDbTransactionError/i,
        /Cannot read properties of undefined \(reading 'startTime'\)/i,
        /Cannot read properties of undefined \(reading 'install'\)/i,
      ],
      integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          enableInp: false, // Disables web-vitals INP tracking which causes startTime crashes on some browsers
        }),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: 0.1, // Reduced to 10% for performance
      // Session Replay
      replaysSessionSampleRate: 0.0, // Disabled standard session replays to save CPU/Battery
      replaysOnErrorSampleRate: 1.0, // Only record sessions when an error actually occurs
    });
  } catch (e) {
    console.warn("Sentry initialization failed (non-critical):", e);
  }
}

function queueNonCriticalInitialization() {
  let initTriggered = false;

  const triggerInit = () => {
    if (initTriggered) return;
    initTriggered = true;

    // Clean up event listeners to avoid memory leaks
    window.removeEventListener("app-ready", triggerInit);

    const init = async () => {
      // Initialize Sentry first among non-critical tasks so error monitoring
      // starts as soon as possible after first paint.
      await initSentryLazy();

      try {
        await initAnalytics();
        await initPerformance();
      } catch (e) {
        console.warn("Non-critical Firebase init failed:", e);
      }
    };

    // Use requestIdleCallback if available, otherwise a small setTimeout
    // This ensures that even when triggered, we don't interrupt active rendering
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => init());
    } else {
      setTimeout(init, 500);
    }
  };

  // 1. Authoritative trigger: when the initial page/dashboard actually mounts
  window.addEventListener("app-ready", triggerInit, { once: true });

  // 2. Absolute fallback timeout (guarantees telemetry initializes eventually)
  setTimeout(triggerInit, 15000);
}

function initServiceWorker() {
  try {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, r) {
        if (r) {
          // 1. Check for updates every hour in the background
          setInterval(
            () => {
              if (r.installing || !navigator.onLine) return;
              r.update().catch(() => {});
            },
            60 * 60 * 1000,
          );

          // 2. Check for updates when the app comes back to the foreground
          // This is CRITICAL for mobile installed PWAs where users just background the app
          document.addEventListener("visibilitychange", () => {
            if (
              document.visibilityState === "visible" &&
              navigator.onLine
            ) {
              r.update().catch(() => {});
            }
          });
        }
      },
      onRegisterError(error: unknown) {
        console.warn(
          "Service worker registration blocked by environment:",
          error,
        );
      },
    });
    Promise.resolve(updateSW).catch((e) => {
      console.warn("Service worker registration rejected:", e);
    });
  } catch (e) {
    console.warn("Failed to call registerSW:", e);
  }
}

// Render UI immediately
renderApplication();

// Register Service Worker immediately for PWA installability and caching
initServiceWorker();

// Initialize telemetry in the background
queueNonCriticalInitialization();
