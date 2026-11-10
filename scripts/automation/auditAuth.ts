import './env';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, db } from '@/shared/lib/firebase';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { bootstrapAutomationEnv } from './env';

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
        '[Audit Auth] FIREBASE_SERVICE_ACCOUNT is neither valid JSON nor valid base64-encoded JSON.'
      );
    }
  }

  if (sa && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  return sa as ServiceAccount;
}

export interface AuditAuthResult {
  authenticatedUid: string;
  projectId: string;
  mode: 'emulator' | 'production_service_account';
}

/**
 * Strictly read-only authentication for the orphan subscription audit.
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. Requires explicit expectedProjectId and asserts project match against credentials and environment.
 * 2. Uses FIREBASE_AUTOMATION_API_KEY (never falls back to website-restricted browser key).
 * 3. Preflight on /users/automation-service-account is STRICTLY READ-ONLY:
 *    If missing, inactive, or not admin, it THROWS AN ERROR.
 *    It NEVER calls setDoc, updateDoc, or creates/upserts/repairs any document.
 * 4. All subsequent Firestore operations run under client SDK subject to Firestore Security Rules.
 */
export async function authenticateReadOnlyForAudit(expectedProjectId: string): Promise<AuditAuthResult> {
  if (!expectedProjectId || !expectedProjectId.trim()) {
    throw new Error('[Audit Auth] Safety abort: An explicit expectedProjectId is required for audit authentication.');
  }
  const expectedProject = expectedProjectId.trim();

  // Bootstrap environment
  bootstrapAutomationEnv(process.env);

  const isEmulator = process.env.VITE_USE_FIREBASE_EMULATORS === 'true';
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const rawKey = process.env.FIREBASE_AUTOMATION_API_KEY;

  if (!isEmulator) {
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      throw new Error(
        '[Audit Auth] Safety abort: FIREBASE_AUTOMATION_API_KEY is missing or blank. ' +
        'Production Node.js automation requires a dedicated, non-website-restricted API key.'
      );
    }
  }

  let serviceAccount: ServiceAccount | null = null;
  if (serviceAccountRaw) {
    serviceAccount = parseServiceAccount(serviceAccountRaw);
    const saProjectId = (serviceAccount as any)?.project_id;
    if (!saProjectId || typeof saProjectId !== 'string' || !saProjectId.trim()) {
      throw new Error(
        '[Audit Auth] Safety abort: Service account is missing required project_id field.'
      );
    }
    if (saProjectId !== expectedProject) {
      throw new Error(
        `[Audit Auth] Safety abort: Service account project_id '${saProjectId}' does not match expected target project '${expectedProject}'.`
      );
    }
  }

  // Setup emulator hosts if in emulator mode
  if (isEmulator) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

  // Initialize Admin SDK if needed
  if (!getApps().length) {
    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: expectedProject,
      });
    } else if (isEmulator) {
      initializeApp({ projectId: expectedProject });
    } else {
      throw new Error(
        '[Audit Auth] Safety abort: FIREBASE_SERVICE_ACCOUNT secret is missing or empty in non-emulator mode.'
      );
    }
  }

  // Strictly read-only preflight on /users/automation-service-account
  const uid = 'automation-service-account';
  const adminDb = getFirestore();
  const userDocRef = adminDb.collection('users').doc(uid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new Error(
      `[Audit Auth] Safety abort: Preflight failed — user document '/users/${uid}' does not exist. ` +
      'The audit is strictly read-only and will never create or repair this document.'
    );
  }

  const userData = userDoc.data();
  if (userData?.role !== 'admin') {
    throw new Error(
      `[Audit Auth] Safety abort: Preflight failed — user document '/users/${uid}' has invalid role '${userData?.role}'. ` +
      "Expected 'admin'. The audit will not modify user roles."
    );
  }

  if (userData?.isActive !== true) {
    throw new Error(
      `[Audit Auth] Safety abort: Preflight failed — user document '/users/${uid}' is inactive (isActive != true). ` +
      'The audit will not activate users.'
    );
  }

  // Mint custom token via Admin SDK
  const customToken = await getAuth().createCustomToken(uid);

  // Authenticate Web Client SDK with custom token
  try {
    await signInWithCustomToken(auth, customToken);
  } catch (err: any) {
    if (
      err?.code === 'auth/requests-from-referer-<empty>-are-blocked' ||
      err?.message?.includes('requests-from-referer-<empty>-are-blocked')
    ) {
      throw new Error(
        '[Audit Auth] Authentication blocked: requests from referer <empty> are blocked. ' +
        'Ensure FIREBASE_AUTOMATION_API_KEY is configured with a dedicated API key without website referrer restrictions.'
      );
    }
    throw new Error(`[Audit Auth] Web Client sign-in failed: ${err?.code || err?.message || 'Unknown auth error'}`);
  }

  // Verify client SDK project alignment
  const clientProjectId = (db as any)?.app?.options?.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!clientProjectId || clientProjectId !== expectedProject) {
    throw new Error(
      `[Audit Auth] Safety abort: Client SDK projectId '${clientProjectId || '<unset>'}' does not match expected target project '${expectedProject}'.`
    );
  }

  return {
    authenticatedUid: uid,
    projectId: expectedProject,
    mode: isEmulator ? 'emulator' : 'production_service_account',
  };
}
