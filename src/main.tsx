import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { GlobalErrorBoundary } from './shared/components/feedback/GlobalErrorBoundary'
import './index.css'
import { initAnalytics, initPerformance } from './shared/lib/firebase'
import { registerSW } from 'virtual:pwa-register'

// Handle dynamic import errors (e.g. when a new version is deployed and old chunks 404)
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html.')
}

function renderApplication() {
  createRoot(rootElement!).render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>,
  )
}

async function initSentryLazy() {
  try {
    const Sentry = await import('@sentry/react')
    const { useEffect } = await import('react')
    const {
      createRoutesFromChildren,
      matchRoutes,
      useLocation,
      useNavigationType,
    } = await import('react-router-dom')

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
      ],
      integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
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
    })
  } catch (e) {
    console.warn('Sentry initialization failed (non-critical):', e)
  }
}

function queueNonCriticalInitialization() {
  const init = async () => {
    // Initialize Sentry first among non-critical tasks so error monitoring
    // starts as soon as possible after first paint.
    await initSentryLazy()

    try {
      await initAnalytics()
      await initPerformance()
    } catch (e) {
      console.warn("Non-critical Firebase init failed:", e)
    }

    try {
      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, r) {
          // Check for updates every hour in the background
          if (r) {
            setInterval(() => {
              if (r.installing || !navigator.onLine) return
              r.update().catch(() => {})
            }, 60 * 60 * 1000)
          }
        },
        onRegisterError(error: unknown) {
          console.warn('Service worker registration blocked by environment:', error)
        }
      })
      Promise.resolve(updateSW).catch((e) => {
        console.warn('Service worker registration rejected:', e)
      })
    } catch (e) {
      console.warn('Failed to call registerSW:', e)
    }
  }

  // Defer initialization to avoid blocking First Paint
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => init())
  } else {
    setTimeout(init, 2000)
  }
}

// Render UI immediately
renderApplication()

// Initialize telemetry in the background
queueNonCriticalInitialization()

