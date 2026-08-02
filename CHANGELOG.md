# Changelog

All notable changes to the Mysuru Paakashale ERP will be documented in this file.

## [1.0.0] - Production Launch (RC1)

This is the initial production release of the Mysuru Paakashale ERP.

### New Features
- **Customer Portal**: Subscription management, daily meal skips, real-time order tracking, and Razorpay integration.
- **Admin Dashboard**: Real-time SLA monitoring, staff management, zone allocation, and drag-and-drop dispatch.
- **Kitchen Display System (KDS)**: Automated daily production targets and step-by-step order preparation tracking.
- **Delivery App**: Route optimization, batch acceptance, and proof of delivery.
- **Accounts & Payroll**: Automated attendance tracking and salary generation.

### Security
- **Firebase Security Rules**: Hardened with strict RBAC ensuring users can only read/write authorized data.
- **App Check**: Enabled across all platforms to prevent unauthorized API calls.

### Performance
- **Code Splitting**: Application chunked successfully via Vite/Rollup for fast initial loads (LCP < 1.2s).
- **Service Worker**: PWA configured for offline caching and fast asset delivery.

### Known Limitations
- Modals currently lack strict keyboard focus trapping (WCAG minor issue).
- High-volume history queries rely on unbounded `onSnapshot` limits; not recommended for scale > 10,000 active concurrent users without pagination.

### Migration Notes
- **V1.0.0** establishes the baseline schema. No database migrations are required.
