import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { GlobalErrorBoundary } from "./shared/components/feedback/GlobalErrorBoundary";
import "./index.css";
import { initAnalytics, initPerformance } from "./shared/lib/firebase";
import { registerSW } from "virtual:pwa-register";
import { toast } from "react-hot-toast";

// Handle dynamic import errors gracefully (e.g. when a new version is deployed and old chunks 404)
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!navigator.onLine) {
    toast.error("You are offline and this section is not cached yet.", {
      duration: 5000,
    });
  } else {
    toast(
      () => (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">
            A required app component was updated. Please save your work and
            refresh.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#3A4D23] text-white px-3 py-1 rounded-md text-sm font-medium self-end"
          >
            Reload Now
          </button>
        </div>
      ),
      { duration: Infinity, id: "preload-error" },
    );
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
        /Cannot read properties of undefined \(reading 'install'\)/i
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
          maskAllText: false,
          blockAllMedia: false,
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

      try {
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            toast(
              (t) => (
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-sm">
                    A new version of the application is available.
                  </p>
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      updateSW(true);
                    }}
                    className="bg-[#3A4D23] text-white px-3 py-1 rounded-md text-sm font-medium self-end"
                  >
                    Update Now
                  </button>
                </div>
              ),
              { duration: Infinity, id: "pwa-update" },
            );
          },
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
                if (document.visibilityState === "visible" && navigator.onLine) {
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

// Render UI immediately
renderApplication();

// Initialize telemetry in the background
queueNonCriticalInitialization();
