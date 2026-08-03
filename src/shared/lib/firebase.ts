/// <reference types="node" />
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from 'firebase/app-check';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getMessaging, isSupported as messagingSupported, type Messaging } from 'firebase/messaging';
import { getAnalytics, isSupported as analyticsSupported, type Analytics } from 'firebase/analytics';
import { getPerformance, type FirebasePerformance } from 'firebase/performance';
import { getRemoteConfig, type RemoteConfig } from 'firebase/remote-config';


// In Node/CI (automation scripts run via vite-node), import.meta.env keys
// may resolve to "" (empty string) for missing vars, so ?? is not enough —
// we use || so that falsy values also fall through to process.env.
// process.env is checked first when running in Node to avoid any stale
// vite-node import.meta.env cache.
function env(key: string): string | undefined {
  const nodeVal = typeof process !== 'undefined' ? process.env[key] : undefined;
  const metaVal = import.meta.env[key] as string | undefined;
  return nodeVal || metaVal || undefined;
}

const firebaseConfig = {
  apiKey:            env('VITE_FIREBASE_API_KEY'),
  authDomain:        env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId:         import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' 
                       ? 'demo-test' 
                       : env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket:     env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId:             env('VITE_FIREBASE_APP_ID'),
};

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
const appCheckSiteKey = env('VITE_APPCHECK_SITE_KEY');
const appCheckDebugToken = env('VITE_APPCHECK_DEBUG_TOKEN');
const isEmulatorMode = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

export const appCheck = (() => {
  // Test environment (Vitest/jsdom) or Emulators (Playwright E2E): skip App Check entirely.
  // firebase/app is mocked in vitest.setup.ts; initializeAppCheck would crash
  // against the mocked undefined app. App Check security is verified in the
  // Firestore/Storage security rule tests, not in unit tests.
  if (import.meta.env.MODE === 'test' || isEmulatorMode) {
    return null;
  }

  // Production path: real reCAPTCHA v3
  if (appCheckSiteKey && !isEmulatorMode) {
    return initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Local / emulator path: use the official App Check debug provider.
  // The SDK reads FIREBASE_APPCHECK_DEBUG_TOKEN if set, or auto-generates one
  // and logs it at startup. Whitelist the token in Firebase Console once.
  if (isEmulatorMode || import.meta.env.DEV) {
    // Setting the global before initializeAppCheck activates the debug provider.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken ?? true;

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

// In emulator / E2E mode, switch Firebase Auth to localStorage persistence.
// Playwright's storageState captures localStorage (not IndexedDB), so this is
// required for saved auth states to survive across test file boundaries.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  setPersistence(auth, browserLocalPersistence).catch(console.error);
}

export const db: Firestore = initializeFirestore(firebaseApp,
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
    ? {
        // In emulator/E2E mode:
        // 1. Use in-memory cache (no IndexedDB overhead or multi-tab locking).
        // 2. Force HTTP long-polling instead of WebChannel/WebSocket.
        //    Playwright's headless Chromium consistently fails the WebChannel
        //    'Listen' stream on first connect (Name/Message: undefined),
        //    causing the Firestore subscription to never fire. Long-polling uses
        //    plain HTTP requests which work reliably in headless environments.
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
      }
    : {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      }
);


import { setLogLevel } from 'firebase/firestore';
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  setLogLevel('debug');
}

export const storage: FirebaseStorage = getStorage(firebaseApp);


let messagingInstance: Messaging | null = null;
let messagingChecked = false;

/**
 * FCM isn't available in every environment (unsupported browsers, iOS
 * Safari unless installed as a PWA, etc). Always resolve it through this
 * helper instead of calling getMessaging() directly — see
 * features/notifications (Phase: Notifications).
 */
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (messagingChecked) return messagingInstance;
  messagingChecked = true;
  if (await messagingSupported()) {
    messagingInstance = getMessaging(firebaseApp);
  }
  return messagingInstance;
}

// Analytics helper – returns Analytics instance if supported, otherwise null
export async function initAnalytics(): Promise<Analytics | null> {
  if (await analyticsSupported()) {
    return getAnalytics(firebaseApp);
  }
  return null;
}

// Performance Monitoring helper – silently skips if not supported
export async function initPerformance(): Promise<FirebasePerformance | null> {
  try {
    return getPerformance(firebaseApp);
  } catch {
    // Silently ignore if performance monitoring is not supported in the current environment
    return null;
  }
}

// Remote Config helper
export function initRemoteConfig(): RemoteConfig | null {
  try {
    const rc = getRemoteConfig(firebaseApp);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 10000 : 3600000;
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
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  // functions emulator removed for Spark plan
  console.info('[firebase] Connected to local Emulator Suite.');
}
