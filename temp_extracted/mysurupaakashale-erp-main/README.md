# Mysuru Paakashale ERP

A comprehensive, role-based Enterprise Resource Planning (ERP) application for the Mysuru Paakashale subscription meal service.

## 🚀 Overview
The Mysuru Paakashale ERP centralizes operations across the entire meal delivery lifecycle:
- **Customers**: Browse plans, manage subscriptions, view payment history, and pause deliveries.
- **Admin**: Oversee the entire business, manage users, subscriptions, payroll, and analyze business metrics.
- **Kitchen Staff**: View daily production boards, manage menus, and track cooking progress.
- **Delivery Partners**: View assigned routes and mark daily deliveries as completed.
- **Accounts**: Handle payroll, verify offline payments, and view financial analytics.

## 🏗️ Architecture

The application is a standard React SPA (Single Page Application) powered by Vite, utilizing Firebase as a Backend-as-a-Service (BaaS).

### Tech Stack
- **Frontend Framework**: React 18 (Vite)
- **Routing**: React Router v6 (using `createBrowserRouter` with lazy loading)
- **Styling**: Tailwind CSS v4 (Utility-first) + Custom Design System
- **State Management & Data Fetching**: TanStack React Query v5 + Zustand (UI State)
- **Icons**: Lucide React
- **Forms & Validation**: React Hook Form + Zod
- **Backend / Database**: Firebase (Auth, Firestore, Storage)

### Layered Architecture
To ensure maintainability and eliminate duplicate code across 5 different role dashboards, the application follows a strict layered architecture:

1. **Pages (`src/features/*/pages`)**: React components that compose widgets and layouts. They contain NO direct Firebase calls.
2. **Custom Hooks (`src/features/*/hooks`)**: React hooks (wrapping React Query) that manage component lifecycle and loading/error states.
3. **Business Services (`src/shared/services/business`)**: Centralized single-source-of-truth logic (e.g. `orderService.generateOrders()`, `subscriptionService.pauseSubscription()`).
4. **Data Repositories (`src/shared/services/firebase`)**: Abstractions over Firestore (`customerRepository`, `orderRepository`). They handle all raw CRUD operations, Zod parsing, and timestamp serialization.

## 🔒 Security & Roles (RBAC)

Authentication is handled by Firebase Auth, but **Authorization** is handled via the `users` collection in Firestore. 

- `users/{uid}` contains a `role` field (`admin`, `customer`, `kitchen`, `delivery_partner`, `accounts`).
- `firestore.rules` enforces read/write limits based on this role (e.g. `isKitchen()` can edit menus, `isAdmin()` can edit anything).
- The frontend enforces role-based routing via `ProtectedRoute.tsx`. Unauthorized users are safely redirected.

## ⚡ Performance Optimization
- **Route-level Code Splitting**: All pages in `AppRouter.tsx` are dynamically imported using `React.lazy()`.
- **Vendor Chunking**: Heavy dependencies (React, Firebase, Recharts, jsPDF) are manually split in `vite.config.ts` to ensure cache-hits across deployments.
- **Optimized Caching**: React Query defaults to a 30s `staleTime` and `refetchOnWindowFocus: false` to prevent aggressive, unnecessary Firestore reads when users switch tabs.

## 🛠️ Local Development

### Prerequisites
- Node.js (v20+)
- Firebase CLI (optional, for deploying rules)

### Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file with your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_key
   VITE_FIREBASE_AUTH_DOMAIN=your_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```

### Deployment
To build for production:
```bash
npm run build
```
This will compile TypeScript and bundle the application into the `/dist` directory. The output is fully optimized, chunked, and ready for deployment to Firebase Hosting, Vercel, or Netlify.
