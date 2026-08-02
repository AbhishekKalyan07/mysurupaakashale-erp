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
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0, 
  // Session Replay
  replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0.0, 
  replaysOnErrorSampleRate: 1.0, 
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html.')
}

async function bootstrap() {
  await initAnalytics()
  await initPerformance()
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
      </StrictMode>,
    )
  }
}

bootstrap()
