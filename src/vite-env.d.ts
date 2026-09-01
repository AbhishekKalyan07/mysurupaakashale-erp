/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Web Push certificate key, needed by firebase/messaging getToken() — Phase: Notifications. */
  readonly VITE_FIREBASE_VAPID_KEY: string;
  /** Razorpay *public* key id (safe for the client) — Phase: Customer/Billing. Never put the key *secret* here. */
  readonly VITE_RAZORPAY_KEY_ID: string;
  /** Set to the literal string "true" to point the app at the local Firebase Emulator Suite. */
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'exceljs';
declare module '@hookform/resolvers/zod';
