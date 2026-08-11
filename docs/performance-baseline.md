# Performance Baseline Report

**Date**: August 9, 2026
**Application**: Mysuru Paakashale ERP

## 1. Bundle Analysis (Vite Build)

### Chunk Sizes (Top 10 Largest)
1. `vendor-firebase.js` - 698.72 kB (gzip: 207.85 kB)
2. `vendor-react.js` - 525.41 kB (gzip: 166.81 kB)
3. `vendor-charts.js` - 411.58 kB (gzip: 116.76 kB)
4. `vendor-reports.js` - 401.15 kB (gzip: 130.55 kB)
5. `index.js` - 209.67 kB (gzip: 66.78 kB)
6. `html2canvas.js` - 200.02 kB (gzip: 47.01 kB)
7. `PremiumButton.js` - 159.51 kB (gzip: 51.91 kB)
8. `vendor-maps.js` - 152.80 kB (gzip: 44.89 kB)
9. `index.es.js` - 151.82 kB (gzip: 49.14 kB)
10. `vendor-sentry.js` - 126.18 kB (gzip: 40.31 kB)

### CSS Size
- Total CSS is injected or outputted via Tailwind; `index.css` source is ~7.3 kB (will verify final minified CSS).

### PWA Precache
- **Precache Size**: 3885.42 KiB (3.88 MB)
- **Precache File Count**: 128 entries
- **Analysis**: The Service Worker is currently precaching the entire application (including heavy admin/charting chunks) on first load.

## 2. Heavy Dependencies Discovered
- `framer-motion`: Extensively used, including in low-level UI components (`PremiumButton`, `PremiumCard`, `MetricCard`, `OrderCard`). This causes a heavy animation library to be included in almost every route.
- `recharts`: Used in AnalyticsCharts. Correctly chunked (`vendor-charts`), but precached globally.
- `react-leaflet` / `leaflet`: Used in `MapPinPicker`. Chunked (`vendor-maps`), but precached globally.
- `jspdf` / `exceljs` / `html2canvas`: Used for reporting. Chunked (`vendor-reports`), but precached globally.

## 3. Startup Blocking Operations (`src/main.tsx`)
Currently, the React application is blocked from rendering until Firebase Analytics and Performance monitoring are initialized over the network:
```typescript
async function bootstrap() {
  await initAnalytics()
  await initPerformance()
  // React rendering is blocked until the above promises resolve!
  if (rootElement) {
    createRoot(rootElement).render(...)
  }
}
```

## 4. Sentry Configuration (`src/main.tsx`)
Sentry is currently running at maximum verbosity:
- `tracesSampleRate: 1.0` (100% of navigations/transactions)
- `replaysSessionSampleRate: 1.0` (Records DOM of 100% of production sessions)
- `replaysOnErrorSampleRate: 1.0` (Records DOM on errors)

*Impact*: Recording 100% of sessions is incredibly heavy on CPU and battery, severely degrading mobile performance for delivery drivers.

## 5. Firestore Listeners
- `usePartnerBoard`: Currently subscribes to `date` + `deliveryPartnerId`. (Good)
- `useProductionBoard`: Currently subscribes to `date` + kitchen status. (Good)

## Conclusion
The application suffers from three critical early-load bottlenecks:
1. React rendering is blocked by Firebase telemetry initialization.
2. The Service worker aggressively downloads a 3.88 MB payload in the background.
3. Sentry Session Replay records the DOM continuously on every device, destroying TTI and battery life.
