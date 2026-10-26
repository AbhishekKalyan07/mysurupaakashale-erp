/**
 * smokeTestAuth.ts — Standalone read-only authentication smoke test.
 *
 * Validates FIREBASE_AUTOMATION_API_KEY end-to-end against the Firebase
 * Identity Toolkit, Token Service, and Firestore Security Rules without
 * executing any business workflows (orders, billing, backups) or performing
 * any database writes/upserts.
 *
 * Sequence:
 *   1. Validate FIREBASE_AUTOMATION_API_KEY is present and non-blank.
 *   2. Initialize Firebase Admin SDK using service-account credentials.
 *   3. Strictly read-only preflight on /users/automation-service-account (must exist, role=admin, isActive=true).
 *   4. Mint custom token for automation-service-account UID.
 *   5. Sign in via Firebase Web Client SDK using custom token & dedicated API key.
 *   6. Force ID-token refresh (validates Token Service API allowlist).
 *   7. Perform read-only getDoc on /settings/business under Firestore Security Rules.
 *   8. Sign out client session and exit cleanly.
 */

import './env';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/shared/lib/firebase';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  let sa: any;
  try {
    sa = JSON.parse(trimmed);
  } catch {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      sa = JSON.parse(decoded);
    } catch {
      throw new Error(
        '[Smoke Test] FIREBASE_SERVICE_ACCOUNT is neither valid JSON nor valid base64-encoded JSON.'
      );
    }
  }

  if (sa && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  return sa as ServiceAccount;
}

export async function runAuthSmokeTest(): Promise<void> {
  // Step 1: Validate dedicated automation API key
  console.log('[Smoke Test] Step 1: Validating dedicated automation API key...');
  const rawKey = process.env.FIREBASE_AUTOMATION_API_KEY;
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    throw new Error(
      '[Smoke Test] FIREBASE_AUTOMATION_API_KEY is missing or blank. ' +
      'Production Node.js automation requires a dedicated, non-website-restricted API key.'
    );
  }
  console.log('[Smoke Test] Step 1 passed: Dedicated automation API key is present.');

  // Step 2: Initialize Firebase Admin SDK
  console.log('[Smoke Test] Step 2: Initializing Firebase Admin SDK...');
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const isEmulator = process.env.VITE_USE_FIREBASE_EMULATORS === 'true';

  if (isEmulator) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

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
        '[Smoke Test] FIREBASE_SERVICE_ACCOUNT secret is missing or empty.'
      );
    }
  }
  console.log('[Smoke Test] Step 2 passed: Firebase Admin SDK initialized.');

  // Step 3: Strictly read-only preflight on /users/automation-service-account
  console.log('[Smoke Test] Step 3: Performing read-only preflight on automation user document...');
  const uid = 'automation-service-account';
  const adminDb = getFirestore();
  const userDocRef = adminDb.collection('users').doc(uid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new Error(
      `[Smoke Test] Preflight failed: user document '/users/${uid}' does not exist. ` +
      'The smoke test is strictly read-only and will not create or repair this document.'
    );
  }

  const userData = userDoc.data();
  if (userData?.role !== 'admin') {
    throw new Error(
      `[Smoke Test] Preflight failed: user document '/users/${uid}' has invalid role '${userData?.role}'. ` +
      "Expected 'admin'. The smoke test will not modify user roles."
    );
  }

  if (userData?.isActive !== true) {
    throw new Error(
      `[Smoke Test] Preflight failed: user document '/users/${uid}' is not active (isActive != true). ` +
      'The smoke test will not modify user status.'
    );
  }
  console.log('[Smoke Test] Step 3 passed: User document verified (role: admin, isActive: true).');

  // Step 4: Mint custom token via Admin SDK
  console.log('[Smoke Test] Step 4: Minting custom token via Admin SDK...');
  const customToken = await getAuth().createCustomToken(uid);
  console.log('[Smoke Test] Step 4 passed: Custom token minted.');

  // Step 5: Authenticate Web Client SDK with custom token
  console.log('[Smoke Test] Step 5: Signing in via Web Client SDK (signInWithCustomToken)...');
  let userCred;
  try {
    userCred = await signInWithCustomToken(auth, customToken);
  } catch (err: any) {
    if (
      err?.code === 'auth/requests-from-referer-<empty>-are-blocked' ||
      err?.message?.includes('requests-from-referer-<empty>-are-blocked')
    ) {
      throw new Error(
        '[Smoke Test] Authentication blocked: requests from referer <empty> are blocked. ' +
        'Ensure FIREBASE_AUTOMATION_API_KEY is configured in GitHub Secrets with a dedicated API key that does not have HTTP website referrer restrictions.'
      );
    }
    throw new Error(
      `[Smoke Test] Web Client sign-in failed: ${err?.code || err?.message || 'Unknown auth error'}`
    );
  }
  console.log('[Smoke Test] Step 5 passed: Web Client SDK authenticated successfully.');

  // Step 6: Force ID-token refresh (validates Token Service API allowlist)
  console.log('[Smoke Test] Step 6: Forcing ID-token refresh (Token Service API)...');
  try {
    await userCred.user.getIdToken(true);
  } catch (err: any) {
    throw new Error(
      `[Smoke Test] Token refresh failed (Token Service API): ${err?.code || err?.message || 'Unknown refresh error'}`
    );
  }
  console.log('[Smoke Test] Step 6 passed: Forced ID-token refresh succeeded.');

  // Step 7: Read-only getDoc of /settings/business under Firestore Security Rules
  console.log('[Smoke Test] Step 7: Performing read-only getDoc of /settings/business...');
  try {
    const settingsDocRef = doc(db, 'settings', 'business');
    const snap = await getDoc(settingsDocRef);
    if (!snap.exists()) {
      console.log('[Smoke Test] /settings/business does not exist, but read access was authorized by security rules.');
    } else {
      console.log('[Smoke Test] /settings/business document read successfully.');
    }
  } catch (err: any) {
    throw new Error(
      `[Smoke Test] Firestore read failed under security rules: ${err?.code || err?.message || 'Unknown firestore error'}`
    );
  }
  console.log('[Smoke Test] Step 7 passed: Read-only Firestore access verified.');

  // Step 8: Sign out client session
  console.log('[Smoke Test] Step 8: Signing out client session...');
  await signOut(auth);
  console.log('[Smoke Test] Step 8 passed: Client signed out.');
  console.log('[Smoke Test] ALL CHECKS PASSED: Dedicated automation API key authentication verified successfully.');
}

// Auto-run if executed directly as entry script
if (process.env.NODE_ENV !== 'test') {
  runAuthSmokeTest().catch((err) => {
    console.error('[Smoke Test] FAILED:', err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  });
}
