import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { GlobalErrorBoundary } from './shared/components/feedback/GlobalErrorBoundary'
import './index.css'
import { initAnalytics, initPerformance } from './shared/lib/firebase'
import * as Sentry from "@sentry/react"
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
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

function queueNonCriticalInitialization() {
  const init = async () => {
    try {
      await initAnalytics()
      await initPerformance()
    } catch (e) {
      console.warn("Non-critical Firebase init failed:", e)
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
