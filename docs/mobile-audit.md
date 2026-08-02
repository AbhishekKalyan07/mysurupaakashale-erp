# Mobile Optimization Audit

This document summarizes the state of the ERP's mobile optimization, evaluating responsive design, touch interactions, and rendering characteristics on mobile form factors.

## Responsive Layout Check
The application utilizes a responsive Tailwind grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`).
- **Admin Dashboard**: Reflows gracefully from 4 columns to 2 columns on tablets, and 1 column on mobile.
- **Tables**: `PremiumTable` implements `overflow-x-auto` to allow horizontal scrolling of data tables on small screens without breaking the viewport width.

## Touch Targets & Interactivity
- **Button Sizing**: Primary CTA buttons (`PremiumButton`) maintain a minimum height of `44px`, satisfying the WCAG 2.2 touch target minimum requirement (24x24px).
- **Navigation**: The sidebar navigation collapses into a mobile-friendly bottom navigation bar (or a hamburger menu) automatically based on viewport bounds.

## Viewport & Safe Area Support
- `viewport-fit=cover` is declared in `index.html`.
- Safe area insets (`env(safe-area-inset-bottom)`) are missing in some absolutely positioned modals (e.g. `ResumeDeliveryModal`).
  - *Recommendation*: Ensure padding accounts for iOS home indicator on floating action buttons.

## Keyboard Overlap
- Forms utilizing `react-hook-form` render natively and allow standard OS-level scroll-to-focus behavior when the virtual keyboard appears.

## Offline Experience
- Firebase SDK offline persistence is currently enabled, allowing the app to read cached state. 
- *Limitation*: Writes while offline are queued locally. The PWA config (`vite-plugin-pwa`) caches standard assets, meaning the app *will* load on mobile without an internet connection and sync when reconnected.
