import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';


// In Node/CI (automation scripts run via vite-node), static ES module imports
// are hoisted and evaluated before any module body runs — so the env.ts shim
// cannot pre-populate import.meta.env in time. We therefore read from
// process.env as a fallback so that GitHub Actions secrets flow through
// correctly without any import-order dependency.
function env(key: string): string | undefined {
  return import.meta.env[key] ?? (typeof process !== 'undefined' ? process.env[key] : undefined);
}

const firebaseConfig = {
  apiKey:            env('VITE_FIREBASE_API_KEY'),
  authDomain:        env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId:         env('VITE_FIREBASE_PROJECT_ID'),
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

export const auth: Auth = getAuth(firebaseApp);

/**
 * Multi-tab IndexedDB persistence: Kitchen/Delivery/Accounts staff often
 * work with a spotty connection (delivery partners in transit, kitchens
 * with weak wifi) — cached reads keep the UI usable, and queued writes
 * sync once back online.
 */
export const db: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

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
  if (await isSupported()) {
    messagingInstance = getMessaging(firebaseApp);
  }
  return messagingInstance;
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
