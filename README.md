# Mysuru Paakashale — Food Subscription ERP

Production codebase for Mysuru Paakashale's subscription ERP: Admin, Customer, Kitchen, Delivery Partner, and Accounts, on React 19 + Firebase.

**This is Phase 0 — the foundation.** Auth, roles, the full data model, Firestore/Storage security rules, and one real (not stubbed) dashboard per role. Each further phase (Customer ordering, Admin management, Kitchen production, Delivery routing, Accounts/billing, Reports, Notifications) ships as its own complete, working slice on top of this — see **Roadmap** below.

## Architecture decisions locked in during Phase 0

These were the three open questions that shape the entire data model, resolved before writing any schema:

1. **Payments: Razorpay.** UPI (including UPI AutoPay for recurring subscription billing), cards, netbanking, and wallets, with India-specific compliance (GST invoicing, RBI e-mandate rules for recurring payments) — the standard choice for an Indian subscription business. Wired into the schema (`Payment`, `Invoice` types; `razorpaySubscriptionId` on `Subscription`) but the actual checkout/webhook integration is Phase: Customer/Billing, not Phase 0.
2. **Subscription model: fixed plans with per-meal choice.** Modeled directly on the real Basic (₹159/day) and Regular (₹210/day) plans — breakfast follows a kitchen-published rotating daily menu, lunch and dinner each offer 2–3 fixed composed options the customer picks as a standing preference. See `src/shared/types/mealPlan.types.ts` and the real plan data in `functions/scripts/seed.ts`.
3. **Delivery assignment: zone-based auto-assign.** `DeliveryZone` documents (pincode lists, with an optional map-drawn polygon for later) are matched to a customer's address; a Cloud Function (Phase: Delivery) auto-assigns new orders to an available partner covering that zone. Kitchens and zones are both modeled as their own collections from day one — a second kitchen or city is a data change, not a schema migration.

## Roadmap

| Phase | Scope |
|---|---|
| **0 — Foundation (this delivery)** | Data model, Firestore/Storage rules, auth (customer self-signup + admin-provisioned staff), role-based routing, shared UI kit, one working dashboard per role |
| 1 — Customer | Browse/subscribe to plans, meal preferences, skip/pause, one-time orders, Razorpay checkout, delivery tracking |
| 2 — Admin | Plan/menu management, staff provisioning UI, zone drawing (Leaflet), live dashboards |
| 3 — Kitchen | Daily production counts, breakfast menu publishing, order status board |
| 4 — Delivery | Daily route list + map, status updates, proof of delivery |
| 5 — Accounts | Invoicing, Razorpay reconciliation, overdue tracking, Excel/PDF exports |
| 6 — Reports & Notifications | Cross-module Excel/PDF reports, FCM push + in-app notification center |

## Project structure

```
mysuru-paakashale-erp/
├── src/
│   ├── app/                    # App.tsx, AppRouter.tsx, and route-only pages (RootRedirect, NotFoundPage)
│   ├── features/
│   │   ├── auth/                # Context, hooks, services, Login/Signup pages, ProtectedRoute
│   │   └── dashboard/           # The 5 role dashboard pages + shared WelcomeCard
│   └── shared/
│       ├── components/
│       │   ├── ui/               # Button, Input, Card, Badge, LeafSpinner — the reusable kit
│       │   ├── feedback/         # LoadingScreen, EmptyState, ErrorState
│       │   └── layout/           # AppShell, Sidebar, Header, navConfig
│       ├── constants/roles.ts    # Single source of truth for role strings (client side)
│       ├── lib/                  # firebase.ts (SDK init), queryClient.ts, queryKeys.ts
│       ├── services/firestore/   # BaseRepository (generic CRUD) + per-collection repositories
│       └── types/                 # Every Firestore document shape, one file per domain area
├── functions/                    # Separate deployable — its own package.json/tsconfig/Node runtime
│   ├── src/
│   │   ├── auth/                  # onUserCreate (blocking fn), createStaffUser (callable)
│   │   ├── lib/admin.ts           # Admin SDK singleton
│   │   └── types/shared.types.ts  # Roles duplicated intentionally — see "Keeping roles in sync"
│   └── scripts/seed.ts            # One-time local seed script (see "Seeding data")
├── firestore.rules / firestore.indexes.json / storage.rules
├── firebase.json / .firebaserc
└── .env.example
```

### Keeping roles in sync

`src/shared/constants/roles.ts` (client) and `functions/src/types/shared.types.ts` (Cloud Functions) both define the same five role strings. They're duplicated on purpose: the frontend and Functions are separate deployables with separate `package.json`/`tsconfig.json`/Node runtimes, and introducing an npm-workspaces monorepo purely to share five string constants would add real build/deploy complexity (especially around Vercel picking up the frontend correctly) for very little benefit at this stage. If you add or rename a role, update both files and `firestore.rules`.

## Setup

1. **Create a Firebase project** (or use an existing one) at [console.firebase.google.com](https://console.firebase.google.com).
2. **Enable Firebase Authentication with Identity Platform** — Authentication → Settings, and accept the Identity Platform upgrade prompt. Plain "Firebase Authentication" does **not** support the blocking function (`onUserCreate`) this app relies on for atomic role assignment — you'll get a deployment error without this step. Then enable the Email/Password sign-in provider.
3. **Create a Cloud Firestore database** and a **Cloud Storage bucket**, both in a region close to your users (e.g. `asia-south1`).
4. **Register a Web app** in Project settings → General, and copy its config into `.env.local` (copy `.env.example` first).
5. `npm install`, then `cd functions && npm install && cd ..`.
6. **Point the CLI at your project**: `npx firebase-tools use --add`, or edit `.firebaserc` directly.
7. **Deploy rules and functions**: `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage:rules,functions`. The first deploy of `storage.rules` will prompt you (console or CLI) to grant Storage permission to read Firestore — accept it, or the delivery-proof-photo rules won't work later.
8. **Seed data** (see below), then `npm run dev`.

## Local development

```bash
npm run dev                    # frontend, http://localhost:5173
cd functions && npm run serve   # Functions + Auth + Firestore + Storage emulators
```

Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env.local` to point the frontend at the emulator suite instead of your real project.

## Seeding data

```bash
cd functions
# 1. Download a service account key (Firebase Console → Project settings →
#    Service accounts → Generate new private key) and save it as:
#    functions/scripts/serviceAccountKey.json  (gitignored, never commit it)
npm run seed
```

This creates the first Admin account (prints the generated login — **change that password immediately**), and seeds the real Basic/Regular meal plans, one Kitchen, and one DeliveryZone. Safe to re-run.

## Deploying

- **Frontend → Vercel**: connect the repo, framework preset "Vite", build command `npm run build`, output directory `dist`. Add the same variables from `.env.local` in Vercel's Environment Variables settings.
- **Functions/Rules → Firebase**: `npx firebase-tools deploy --only functions,firestore:rules,firestore:indexes,storage:rules` (or `functions`/`firestore:rules`/etc individually).

## Design notes

Palette and type are grounded in the actual product rather than generic defaults — see the token comments in `src/index.css`: banana-leaf green + turmeric gold + tamarind red-orange (sparingly), Zilla Slab for display type, IBM Plex Sans for UI, IBM Plex Mono for tabular data (prices, order IDs, timestamps). The one deliberate signature touch is `LeafSpinner` (`src/shared/components/ui/LeafSpinner.tsx`) — a swaying leaf silhouette instead of a generic spinner, used everywhere something is loading.

## Known considerations for later phases

- The `vendor-firebase` build chunk is ~677 KB (199 KB gzipped) — the full Auth+Firestore+Storage+Messaging SDK. Worth lazy-loading `firebase/messaging` (only needed once a user opts into push) when Phase: Notifications lands.
- `BaseRepository.update`'s `Partial<T>` typing doesn't fully enforce field consistency for `UserProfile` (a discriminated union) — see the comment on that method. Add a narrower, precisely-typed method on a feature's own repository wherever that matters more than convenience.
- Run `npm audit` in both the root project and `functions/` periodically — a couple of moderate advisories currently come from transitive dependencies of `exceljs`/`jspdf`/`firebase-tools`.
