/// <reference types="node" />
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from 'firebase/app-check';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
// Note: Messaging, Analytics, Performance, and RemoteConfig are dynamically
// imported in their respective helper functions below to significantly reduce
// the initial Javascript bundle size and improve Total Blocking Time (TBT).


// In Node/CI (automation scripts run via vite-node), import.meta.env properties
// may be undefined, so we fallback to process.env.
function getEnv(key: string, metaValue: any, required: boolean = true): string | undefined {
  const value = metaValue ?? (typeof process !== 'undefined' ? process.env[key] : undefined);
  if (required && !value) {
    throw new Error(`[config] Missing required environment variable: ${key}. Check your .env / deploy secrets against .env.example.`);
  }
  return value;
}

const firebaseConfig = {
  apiKey:            getEnv('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain:        getEnv('VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId:         getEnv('VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket:     getEnv('VITE_FIREBASE_STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId:             getEnv('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID),
};

const useEmulators = getEnv('VITE_USE_FIREBASE_EMULATORS', import.meta.env.VITE_USE_FIREBASE_EMULATORS, false) === 'true';
if (import.meta.env.DEV) {
  console.log('BROWSER_DEBUG_EMULATORS:', {
    rawMeta: import.meta.env.VITE_USE_FIREBASE_EMULATORS,
    evaluated: useEmulators,
    mode: import.meta.env.MODE
  });
}

// Fail loudly in dev if env vars are missing, instead of a cryptic
// "auth/invalid-api-key" three files deep into the app.
if (import.meta.env.DEV || (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production')) {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missingKeys.length > 0) {
    console.error(
      `[firebase] Missing env vars: ${missingKeys.join(', ')}. Copy .env.example to .env.local and fill in your Firebase project's web config (Project settings → General → Your apps).`,
    );
  }
}

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// Firebase App Check
//
// Strategy (three-tier):
//   1. Production: ReCaptchaV3 using VITE_APPCHECK_SITE_KEY.
//   2. Local dev (emulator) with VITE_APPCHECK_DEBUG_TOKEN set: registered
//      debug token (whitelist once in Firebase Console → App Check → Apps →
//      Manage debug tokens).
//   3. Local dev without VITE_APPCHECK_DEBUG_TOKEN: the SDK auto-generates a
//      token and logs it as "[App Check] Debug token: <uuid>". Copy that UUID
//      to Firebase Console to whitelist it for your dev machine.
//
// DO NOT set VITE_APPCHECK_SITE_KEY=undefined to skip production enforcement —
// App Check is always active; it only switches provider based on environment.
//
// Deployment steps:
//   1. Firebase Console → App Check → Register your web app with reCAPTCHA v3.
//   2. Copy the site key to VITE_APPCHECK_SITE_KEY in your hosting environment.
//   3. Enforce App Check: Firebase Console → App Check → Firestore/Auth/Storage
//      → Enforce (after validating existing traffic shows in the dashboard).
// ---------------------------------------------------------------------------
const appCheckSiteKey = getEnv('VITE_APPCHECK_SITE_KEY', import.meta.env.VITE_APPCHECK_SITE_KEY, false);
const appCheckDebugToken = getEnv('VITE_APPCHECK_DEBUG_TOKEN', import.meta.env.VITE_APPCHECK_DEBUG_TOKEN, false);

if (import.meta.env.PROD && appCheckDebugToken) {
  throw new Error('SECURITY: VITE_APPCHECK_DEBUG_TOKEN must not be set in production builds.');
}

/**
 * Exported config error flag. When set, App.tsx renders a blocking error
 * screen instead of the normal application — React does mount, so the
 * error boundary can show a human-readable message rather than leaving
 * the user staring at a frozen loading spinner.
 *
 * App Check remains required for production security; we simply surface
 * the misconfiguration clearly rather than crashing at module scope.
 */
export let appCheckConfigError: string | null = null;
if (import.meta.env.PROD && !appCheckSiteKey) {
  appCheckConfigError = 'Production build requires VITE_APPCHECK_SITE_KEY. '
    + 'Configure it in your hosting environment (Vercel / Firebase Hosting / etc).';
  console.error('[CRITICAL]', appCheckConfigError);
}
const isEmulatorMode = useEmulators;

export const appCheck = (() => {
  // Test environment (Vitest/jsdom) or Emulators (Playwright E2E): skip App Check entirely.
  // firebase/app is mocked in vitest.setup.ts; initializeAppCheck would crash
  // against the mocked undefined app. App Check security is verified in the
  // Firestore/Storage security rule tests, not in unit tests.
  if (import.meta.env.MODE === 'test' || isEmulatorMode) {
    return null;
  }

const isNode = typeof globalThis.window === 'undefined';

  const isNodeEnv = isNode;

  // Production path: real reCAPTCHA v3
  // Only attempt ReCaptcha if we are in a browser environment (window is defined).
  if (appCheckSiteKey && !isEmulatorMode && !isNodeEnv) {
    return initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Local / emulator path: use the official App Check debug provider.
  // Also used for Node.js automation scripts that must authenticate with a debug token.
  // The SDK reads FIREBASE_APPCHECK_DEBUG_TOKEN if set, or auto-generates one
  // and logs it at startup. Whitelist the token in Firebase Console once.
  if (isEmulatorMode || import.meta.env.DEV || isNodeEnv) {
    // Setting the global before initializeAppCheck activates the debug provider.
    // Using globalThis instead of self ensures compatibility with Node.js.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken ?? true;

    return initializeAppCheck(firebaseApp, {
      // CustomProvider is a no-op here; the SDK intercepts via the global debug flag.
      provider: new CustomProvider({
        getToken: () => Promise.resolve({ token: 'debug', expireTimeMillis: Date.now() + 3_600_000 }),
      }),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Fallback: no App Check in non-emulator, non-production environments
  // (e.g., Vitest/Node). Log to alert developers.
  console.warn(
    '[firebase] App Check not initialised — set VITE_APPCHECK_SITE_KEY for production ' +
    'or VITE_USE_FIREBASE_EMULATORS=true for local development.',
  );
  return null;
})();



/**
 * Multi-tab IndexedDB persistence: Kitchen/Delivery/Accounts staff often
 * work with a spotty connection (delivery partners in transit, kitchens
 * with weak wifi) — cached reads keep the UI usable, and queued writes
 * sync once back online.
 */
export const auth: Auth = getAuth(firebaseApp);

// Force localStorage persistence for Firebase Auth instead of IndexedDB.
// iOS Safari and PWAs often wipe IndexedDB when the app is backgrounded or closed,
// causing users to be randomly logged out. LocalStorage is far more reliable for PWAs.
if (typeof globalThis.window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(console.error);
}

import { persistentSingleTabManager } from 'firebase/firestore';

export const db: Firestore = initializeFirestore(firebaseApp,
  (useEmulators || typeof globalThis.window === 'undefined')
    ? {
        // In emulator/E2E/Node mode:
        // 1. Use in-memory cache (no IndexedDB overhead or multi-tab locking).
        // 2. Force HTTP long-polling instead of WebChannel/WebSocket.
        //    Playwright's headless Chromium consistently fails the WebChannel
        //    'Listen' stream on first connect (Name/Message: undefined),
        //    causing the Firestore subscription to never fire. Long-polling uses
        //    plain HTTP requests which work reliably in headless environments.
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      }
    : {
        // Use singleTabManager instead of multipleTabManager. 
        // iOS Safari/PWAs have a severe bug where multipleTabManager freezes for 10-20s
        // trying to acquire locks when the app is foregrounded after a day.
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
        ignoreUndefinedProperties: true,
      }
);


import { setLogLevel } from 'firebase/firestore';
if (useEmulators) {
  setLogLevel('debug');
}

export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp, 'asia-south1');


let messagingInstance: any = null;
let messagingChecked = false;

/**
 * FCM isn't available in every environment (unsupported browsers, iOS
 * Safari unless installed as a PWA, etc). Always resolve it through this
 * helper instead of calling getMessaging() directly — see
 * features/notifications (Phase: Notifications).
 */
export async function getMessagingIfSupported(): Promise<any | null> {
  if (import.meta.env.DEV || import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return null;
  }
  if (messagingChecked) return messagingInstance;
  messagingChecked = true;
  
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    if (await isSupported()) {
      messagingInstance = getMessaging(firebaseApp);
    }
  } catch (err) {
    console.warn('[firebase] Failed to load messaging', err);
  }
  return messagingInstance;
}

// Analytics helper – returns Analytics instance if supported, otherwise null
export async function initAnalytics(): Promise<any | null> {
  // Prevent unhandled rejections from Firebase SDK trying to fetch dynamic configs locally
  if (import.meta.env.DEV || import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return null;
  }
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) {
      return getAnalytics(firebaseApp);
    }
  } catch (err) {
    console.warn('[firebase] Failed to load analytics', err);
  }
  return null;
}

// Performance Monitoring helper – silently skips if not supported
export async function initPerformance(): Promise<any | null> {
  if (import.meta.env.DEV || import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return null;
  }
  try {
    const { getPerformance } = await import('firebase/performance');
    return getPerformance(firebaseApp);
  } catch {
    // Silently ignore if performance monitoring is not supported in the current environment
    return null;
  }
}

// Remote Config helper
export async function initRemoteConfig(): Promise<any | null> {
  if (import.meta.env.DEV || import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return null;
  }
  try {
    const { getRemoteConfig } = await import('firebase/remote-config');
    const rc = getRemoteConfig(firebaseApp);
    rc.settings.minimumFetchIntervalMillis = 3600000;
    return rc;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local Firebase Emulator Suite — strictly opt-in via env var, so `npm run
// dev` never silently talks to the emulator (or vice versa) depending on
// what happens to be running in a teammate's terminal. See README.md.
// ---------------------------------------------------------------------------
if (useEmulators) {
  // Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues in CI/Playwright
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.info('[firebase] Connected to local Emulator Suite.');
}
