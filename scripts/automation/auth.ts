// IMPORTANT: env.ts MUST be the very first import so that all VITE_* keys
// from process.env are mapped into import.meta.env before Firebase initialises.
import './env';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Parses the FIREBASE_SERVICE_ACCOUNT env variable.
 *
 * GitHub Actions secrets are stored as raw strings. Some CI setups
 * base64-encode multi-line JSON to avoid newline/quoting issues.
 * We try plain JSON first, then fall back to base64-decoded JSON.
 */
function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  let sa: any;
  // Attempt 1: plain JSON
  try {
    sa = JSON.parse(trimmed);
  } catch {
    // Attempt 2: base64-encoded JSON
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      sa = JSON.parse(decoded);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is neither valid JSON nor valid base64-encoded JSON. ' +
        'Generate a new key from Firebase Console → Project settings → Service accounts → Generate new private key, ' +
        'then paste the raw JSON (or its base64 encoding) as the GitHub secret.'
      );
    }
  }

  // Normalize private key: in CI environments / GitHub secrets, newlines are often escaped as literal \n
  if (sa && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  return sa as ServiceAccount;
}

export async function authenticateForAutomation() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const isEmulator = process.env.VITE_USE_FIREBASE_EMULATORS === 'true';

  // In local emulator mode, firebase-admin needs FIREBASE_AUTH_EMULATOR_HOST
  // to sign custom tokens locally without Google IAM credentials, and
  // FIRESTORE_EMULATOR_HOST to connect to the local Firestore emulator.
  if (isEmulator) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

  // Initialize firebase-admin if not already initialized
  if (!getApps().length) {
    if (serviceAccountRaw) {
      const serviceAccount = parseServiceAccount(serviceAccountRaw);
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else if (isEmulator) {
      const projectId =
        process.env.VITE_FIREBASE_PROJECT_ID ??
        (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID ??
        'demo-test';
      initializeApp({ projectId });
    } else {
      throw new Error(
        'Automation credentials missing. Set FIREBASE_SERVICE_ACCOUNT in GitHub Actions secrets or .env.local (see .env.example).'
      );
    }
  } else if (!serviceAccountRaw && !isEmulator) {
    // Admin SDK was already initialised (e.g., in tests), but credentials are absent
    // and we're not in emulator mode — proceed and let the underlying SDK call fail
    // with its own error rather than masking the real problem.
  }

  // We use a deterministic UID for automation so we can grant it the admin role once
  const uid = 'automation-service-account';

  // Generate a custom token using the Admin SDK (bypasses password auth entirely)
  const customToken = await getAuth().createCustomToken(uid);

  // Authenticate the Firebase client SDK with that custom token.
  // The client SDK is used by all the existing services (automationService, billingService,
  // orderService, etc.) so this gives them an authenticated context that passes
  // Firestore security rules.
  const userCred = await signInWithCustomToken(auth, customToken);

  // Ensure the automation user has an admin role document in Firestore so
  // security rules (which do a live document lookup via callerDoc()) grant access.
  // We use the Admin Firestore SDK here to write the document, bypassing rules.
  const adminDb = getFirestore();
  const userDocRef = adminDb.collection('users').doc(userCred.user.uid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists || userDoc.data()?.role !== 'admin' || userDoc.data()?.isActive !== true) {
    const serviceAccount = serviceAccountRaw ? parseServiceAccount(serviceAccountRaw) : null;
    const now = FieldValue.serverTimestamp();
    const updateData: Record<string, any> = {
      id: userCred.user.uid,
      email: (serviceAccount as any)?.client_email ?? 'automation@service.account',
      role: 'admin',
      firstName: 'Automation',
      lastName: 'Service',
      isActive: true,
      updatedAt: now,
    };
    if (!userDoc.exists) {
      updateData.createdAt = now;
    }
    await userDocRef.set(updateData, { merge: true });
    console.log('Upserted admin role for automation user in Firestore.');
  }

  console.log('Authenticated as automation admin.');
}
