import crypto from 'crypto';
import type { App } from 'firebase-admin/app';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class AccountNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountNotFoundError';
  }
}

export class InvalidRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoleError';
  }
}

export class AccountDeactivatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountDeactivatedError';
  }
}

export class AuthUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthUserNotFoundError';
  }
}

export class ConfirmationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationRequiredError';
  }
}

export class OperatorUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorUnauthorizedError';
  }
}

export class SafetyAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyAbortError';
  }
}

export class AuditInitiationError extends SafetyAbortError {
  readonly outcome = 'FAILED_PRE_MUTATION' as const;
  readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'AuditInitiationError';
    this.originalError = originalError;
  }
}

export class AuthMutationError extends Error {
  readonly outcome = 'FAILED_PRE_MUTATION' as const;
  readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'AuthMutationError';
    this.originalError = originalError;
  }
}

export class IndeterminateRecoveryError extends Error {
  readonly outcome = 'INDETERMINATE' as const;
  readonly targetUid: string;
  readonly profile: VerifiedDeliveryPartnerProfile;
  readonly temporaryPassword: string;
  readonly originalError: Error;
  readonly initiationAuditId?: string;

  constructor(
    message: string,
    profile: VerifiedDeliveryPartnerProfile,
    temporaryPassword: string,
    originalError: Error,
    initiationAuditId?: string
  ) {
    super(message);
    this.name = 'IndeterminateRecoveryError';
    this.targetUid = profile.uid;
    this.profile = profile;
    this.temporaryPassword = temporaryPassword;
    this.originalError = originalError;
    this.initiationAuditId = initiationAuditId;
  }
}

export class PartialRecoveryAuditFailureError extends Error {
  readonly outcome = 'SUCCESS_AUDIT_FAILED' as const;
  readonly targetUid: string;
  readonly temporaryPassword: string;
  readonly profile: VerifiedDeliveryPartnerProfile;
  readonly initiationAuditId?: string;
  readonly auditError: Error;

  constructor(
    message: string,
    profile: VerifiedDeliveryPartnerProfile,
    temporaryPassword: string,
    auditError: Error,
    initiationAuditId?: string
  ) {
    super(message);
    this.name = 'PartialRecoveryAuditFailureError';
    this.targetUid = profile.uid;
    this.profile = profile;
    this.temporaryPassword = temporaryPassword;
    this.auditError = auditError;
    this.initiationAuditId = initiationAuditId;
  }
}

export interface VerifiedDeliveryPartnerProfile {
  uid: string;
  role: 'delivery_partner';
  displayName: string;
  email: string;
  emailMasked: string;
  phone: string;
  phoneMasked: string;
  staffId: string;
  zoneIds: string[];
  isActive: boolean;
}

export interface OperatorIdentity {
  id: string;
  name: string;
  role: string;
}

export interface AdminContext {
  auth: Auth;
  db: Firestore;
  operator: OperatorIdentity;
  projectId: string;
  app: App;
  authMode: 'emulator' | 'service_account' | 'adc';
}

export interface AdminInitOptions {
  appName?: string;
  forceEmulator?: boolean;
  forceAdc?: boolean;
}

export type RecoveryOutcome =
  | 'SUCCESS_COMPLETE'
  | 'SUCCESS_AUDIT_FAILED'
  | 'FAILED_PRE_MUTATION'
  | 'INDETERMINATE';

export interface ResetOptions {
  auth: Auth;
  db: Firestore;
  targetUid: string;
  operator: OperatorIdentity;
  confirm: boolean;
  dryRun?: boolean;
  expectedProjectId: string;
  reason?: string;
  throwOnAuditFailure?: boolean;
}

export interface ResetResult {
  outcome: RecoveryOutcome;
  success: boolean;
  targetUid: string;
  temporaryPassword?: string;
  dryRun?: boolean;
  profile: VerifiedDeliveryPartnerProfile;
  initiationAuditId?: string;
  completionAuditId?: string;
  auditError?: string;
  error?: string;
}

/**
 * Mask an email address to protect privacy in logs, terminal summaries, and audit entries.
 * e.g., "delivery.ravi@mysurupaakashale.com" -> "d***i@mysurupaakashale.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mask a phone number to protect privacy.
 * e.g., "+919876543210" -> "+91*****10"
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 5) return '***';
  return `${phone.slice(0, 3)}*****${phone.slice(-2)}`;
}

/**
 * Generates a cryptographically strong, human-readable temporary password.
 * Satisfies Firebase Auth constraints (>6 characters) and provides >70 bits of entropy.
 * Avoids visually confusing characters (0/O/o, 1/l/I) so partners can type it accurately.
 */
export function generateSecureTemporaryPassword(length: number = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
  const lower = 'abcdefghijkmnpqrstuvwxyz'; // no l, o
  const digits = '23456789'; // no 0, 1
  const symbols = '!@#$%*+-=';

  // Ensure minimum character variety
  const passwordChars: string[] = [
    upper[crypto.randomInt(0, upper.length)],
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  const allChars = upper + lower + digits + symbols;
  while (passwordChars.length < length) {
    passwordChars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  // Cryptographically shuffle array using Fisher-Yates
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

/**
 * Validates target account identity, role, and active status against both Firestore and Firebase Auth.
 * Strictly verifies that the target account is an active delivery partner.
 */
export async function verifyTargetDeliveryPartner(
  auth: Auth,
  db: Firestore,
  targetUid: string
): Promise<VerifiedDeliveryPartnerProfile> {
  const cleanUid = (targetUid || '').trim();
  if (!cleanUid) {
    throw new SafetyAbortError('Target UID cannot be empty.');
  }

  // 1. Verify Firestore user record
  const userDocRef = db.collection('users').doc(cleanUid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new AccountNotFoundError(
      `Account verification failed: Firestore document '/users/${cleanUid}' does not exist.`
    );
  }

  const data = userDoc.data() || {};

  // 2. Strict Role Boundary: Delivery Partner ONLY
  if (data.role !== 'delivery_partner') {
    throw new InvalidRoleError(
      `Role violation: User '${cleanUid}' has role '${data.role}'. ` +
      `This recovery utility is strictly restricted to 'delivery_partner' accounts. ` +
      `Recovery for '${data.role}' is not permitted through this workflow.`
    );
  }

  // 3. Active status check
  if (data.isActive === false) {
    throw new AccountDeactivatedError(
      `Account inactive: Delivery partner '${cleanUid}' is marked as deactivated (isActive: false). ` +
      `Reactivate the staff member in Staff Management before resetting their password.`
    );
  }

  // 4. Verify Firebase Auth account
  let authUser: UserRecord;
  try {
    authUser = await auth.getUser(cleanUid);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      throw new AuthUserNotFoundError(
        `Firebase Auth mismatch: User document exists in '/users/${cleanUid}', ` +
        `but no corresponding Firebase Authentication identity was found.`
      );
    }
    throw new SafetyAbortError(`Failed to fetch Firebase Auth user: ${err?.message || err}`);
  }

  if (authUser.disabled) {
    throw new AccountDeactivatedError(
      `Firebase Auth disabled: The Authentication record for '${cleanUid}' is disabled. ` +
      `Enable the user in Firebase Auth before resetting credentials.`
    );
  }

  const email = authUser.email || data.email || '';
  const phone = data.phone || authUser.phoneNumber || '';

  return {
    uid: cleanUid,
    role: 'delivery_partner',
    displayName: data.displayName || data.name || authUser.displayName || 'Delivery Partner',
    email,
    emailMasked: maskEmail(email),
    phone,
    phoneMasked: maskPhone(phone),
    staffId: data.staffId || data.displayId || 'N/A',
    zoneIds: Array.isArray(data.zoneIds) ? data.zoneIds : [],
    isActive: true,
  };
}

/**
 * Determines whether an error returned from Firebase Authentication is ambiguous
 * (such as a network timeout, socket hangup, or connection termination) where the
 * server may or may not have received and committed the password update before the
 * connection was severed.
 */
export function isIndeterminateAuthError(err: any): boolean {
  if (!err) return false;
  const code = String(err?.code || '').toLowerCase();

  // Definitive client-side or Auth validation errors that guarantee no mutation occurred
  const definitiveCodes = [
    'auth/user-not-found',
    'auth/user-disabled',
    'auth/invalid-uid',
    'auth/invalid-password',
    'auth/argument-error',
    'auth/invalid-argument',
    'auth/invalid-claims',
    'auth/operation-not-allowed',
    'auth/insufficient-permission',
  ];
  if (definitiveCodes.includes(code)) {
    return false;
  }

  return true;
}

/**
 * Executes administrative password recovery with robust partial-failure handling:
 * 1. Verifies delivery partner identity, role, and active status against Firestore & Auth.
 * 2. Enforces explicit operator confirmation.
 * 3. Step 1 (Pre-mutation Audit): Writes an initiation audit log record to Firestore.
 *    If this fails, the process aborts immediately, preventing un-audited password mutations.
 * 4. Step 2 (Auth Mutation): Updates password via Firebase Auth Admin SDK.
 *    Catches errors and classifies them as definitive (failed pre-mutation) vs indeterminate.
 * 5. Step 3 (Post-mutation Audit): Writes completion audit log with initiation link.
 *    If completion audit fails, returns outcome 'SUCCESS_AUDIT_FAILED' preserving the
 *    temporary password for the operator while alerting them to the audit logging failure.
 */
export async function executeDeliveryPartnerPasswordReset(options: ResetOptions): Promise<ResetResult> {
  const {
    auth,
    db,
    targetUid,
    operator,
    confirm,
    dryRun = false,
    expectedProjectId,
    reason,
    throwOnAuditFailure = false,
  } = options;

  if (!expectedProjectId || !expectedProjectId.trim()) {
    throw new SafetyAbortError('Explicit expectedProjectId is required for password recovery execution.');
  }

  // 1. Verify target delivery partner
  const profile = await verifyTargetDeliveryPartner(auth, db, targetUid);

  // 2. Verify operator authorization
  if (!operator || !operator.id || operator.role !== 'admin') {
    throw new OperatorUnauthorizedError(
      `Operator authorization failed: Operator role '${operator?.role}' is not authorized. ` +
      `Password recovery requires 'admin' role.`
    );
  }

  // 3. Confirmation assertion
  if (!confirm) {
    throw new ConfirmationRequiredError(
      `Explicit confirmation required: Reset was not confirmed for delivery partner '${profile.displayName}' (${profile.uid}). ` +
      `Operation aborted. No changes made.`
    );
  }

  if (dryRun) {
    return {
      outcome: 'SUCCESS_COMPLETE',
      success: true,
      targetUid: profile.uid,
      dryRun: true,
      profile,
    };
  }

  // 4. Generate temporary password in memory
  const temporaryPassword = generateSecureTemporaryPassword();

  // 5. STEP 1: Pre-mutation Audit Initiation
  // Guarantees that audit capability exists before mutating credentials.
  // If Firestore is unavailable or permission is missing, this write fails and prevents mutation.
  let initDocRef: { id: string };
  try {
    const initiationEntry = {
      action: 'admin_delivery_partner_password_reset_initiated',
      entityType: 'user',
      entityId: profile.uid,
      performedBy: operator.id,
      performedByRole: 'admin',
      performedByName: operator.name || 'System Admin',
      timestamp: FieldValue.serverTimestamp(),
      details: {
        targetRole: 'delivery_partner',
        targetStaffId: profile.staffId,
        targetEmailMasked: profile.emailMasked,
        recoveryMethod: 'admin_assisted',
        stage: 'initiated',
        status: 'pending_auth_update',
      },
      previousValue: null,
      newValue: null,
      reason: reason || 'Admin-assisted password recovery initiated for delivery partner with inaccessible inbox',
      ipAddress: null,
    };

    initDocRef = await db.collection('auditLogs').add(initiationEntry);
  } catch (err: any) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    throw new AuditInitiationError(
      `Audit initiation failed: Unable to record pre-mutation audit log in Firestore. ` +
      `Password mutation aborted to prevent un-audited credential changes. Error: ${errorObj.message}`,
      errorObj
    );
  }

  // 6. STEP 2: Password Mutation in Firebase Authentication
  try {
    await auth.updateUser(profile.uid, {
      password: temporaryPassword,
    });
  } catch (err: any) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    const isIndeterminate = isIndeterminateAuthError(err);

    // Best-effort attempt to record failure in Firestore audit log
    try {
      await db.collection('auditLogs').add({
        action: isIndeterminate
          ? 'admin_delivery_partner_password_reset_indeterminate'
          : 'admin_delivery_partner_password_reset_failed',
        entityType: 'user',
        entityId: profile.uid,
        performedBy: operator.id,
        performedByRole: 'admin',
        performedByName: operator.name || 'System Admin',
        timestamp: FieldValue.serverTimestamp(),
        details: {
          targetRole: 'delivery_partner',
          targetStaffId: profile.staffId,
          targetEmailMasked: profile.emailMasked,
          recoveryMethod: 'admin_assisted',
          stage: isIndeterminate ? 'indeterminate' : 'auth_failed',
          status: isIndeterminate ? 'password_update_indeterminate' : 'password_update_failed',
          initiationAuditId: initDocRef.id,
          errorMessage: errorObj.message,
        },
        previousValue: null,
        newValue: null,
        reason: reason || 'Admin-assisted password recovery failed during Auth mutation',
        ipAddress: null,
      });
    } catch {
      // Best-effort audit logging; do not suppress original auth error
    }

    if (isIndeterminate) {
      throw new IndeterminateRecoveryError(
        `Firebase Authentication password update returned an indeterminate error: ${errorObj.message}. ` +
        `The password may or may not have changed. Do not retry automatically.`,
        profile,
        temporaryPassword,
        errorObj,
        initDocRef.id
      );
    }

    throw new AuthMutationError(
      `Firebase Authentication update failed: ${errorObj.message}. Password was not changed.`,
      errorObj
    );
  }

  // 7. STEP 3: Post-mutation Completion Audit Log
  // Auth.updateUser SUCCEEDED. The password HAS been changed.
  try {
    const completionEntry = {
      action: 'admin_delivery_partner_password_reset',
      entityType: 'user',
      entityId: profile.uid,
      performedBy: operator.id,
      performedByRole: 'admin',
      performedByName: operator.name || 'System Admin',
      timestamp: FieldValue.serverTimestamp(),
      details: {
        targetRole: 'delivery_partner',
        targetStaffId: profile.staffId,
        targetEmailMasked: profile.emailMasked,
        recoveryMethod: 'admin_assisted',
        stage: 'completed',
        status: 'password_updated',
        initiationAuditId: initDocRef.id,
      },
      previousValue: null,
      newValue: null,
      reason: reason || 'Admin-assisted password recovery completed for delivery partner with inaccessible inbox',
      ipAddress: null,
    };

    const completionDocRef = await db.collection('auditLogs').add(completionEntry);

    return {
      outcome: 'SUCCESS_COMPLETE',
      success: true,
      targetUid: profile.uid,
      temporaryPassword,
      dryRun: false,
      profile,
      initiationAuditId: initDocRef.id,
      completionAuditId: completionDocRef.id,
    };
  } catch (auditErr: any) {
    const auditErrorObj = auditErr instanceof Error ? auditErr : new Error(String(auditErr));

    if (throwOnAuditFailure) {
      throw new PartialRecoveryAuditFailureError(
        `Critical partial failure: Password was successfully updated in Firebase Authentication, ` +
        `but writing the completion audit log failed: ${auditErrorObj.message}`,
        profile,
        temporaryPassword,
        auditErrorObj,
        initDocRef.id
      );
    }

    return {
      outcome: 'SUCCESS_AUDIT_FAILED',
      success: true,
      targetUid: profile.uid,
      temporaryPassword,
      dryRun: false,
      profile,
      initiationAuditId: initDocRef.id,
      auditError: auditErrorObj.message,
    };
  }
}

/**
 * Detects whether Google Application Default Credentials (ADC) are configured
 * either via GOOGLE_APPLICATION_CREDENTIALS or the standard user gcloud ADC file.
 */
export function getAdcCredentialsPath(): string | null {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath && envPath.trim() && fs.existsSync(envPath.trim())) {
    return envPath.trim();
  }

  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  if (homeDir) {
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      const winPath = path.join(appData, 'gcloud', 'application_default_credentials.json');
      if (fs.existsSync(winPath)) return winPath;
    }
    const unixPath = path.join(homeDir, '.config', 'gcloud', 'application_default_credentials.json');
    if (fs.existsSync(unixPath)) return unixPath;
  }

  return null;
}

/**
 * Initializes a trusted Admin SDK context:
 * - Checks target project alignment.
 * - Supports:
 *   1. Local Firebase Auth / Firestore emulators (when env variables or flags are set).
 *   2. FIREBASE_SERVICE_ACCOUNT environment variable (Service Account JSON / base64).
 *   3. Google Application Default Credentials (ADC via gcloud auth application-default login).
 * - Fails closed if credentials, project configuration, or operator authorization cannot be verified.
 */
export async function initializeAdminContext(
  expectedProjectId: string,
  options?: AdminInitOptions
): Promise<AdminContext> {
  const targetProject = (expectedProjectId || '').trim();
  if (!targetProject) {
    throw new SafetyAbortError('Target project ID is required for administrative initialization.');
  }

  const appName = options?.appName || `admin-recovery-${Date.now()}`;
  const isEmulator =
    options?.forceEmulator !== undefined
      ? options.forceEmulator
      : (process.env.VITE_USE_FIREBASE_EMULATORS === 'true' ||
         Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
         Boolean(process.env.FIRESTORE_EMULATOR_HOST));

  if (!isEmulator && (Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) || Boolean(process.env.FIRESTORE_EMULATOR_HOST))) {
    throw new SafetyAbortError(
      'Cannot initialize production credentials while emulator host environment variables ' +
      '(FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST) are set. Unset them before running against live project.'
    );
  }

  // Strategy 1: Local Emulator Mode
  if (isEmulator) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
    }

    const app = initializeApp({ projectId: targetProject }, appName);
    return {
      auth: getAuth(app),
      db: getFirestore(app),
      operator: {
        id: 'emulator-admin',
        name: 'Local Emulator Administrator',
        role: 'admin',
      },
      projectId: targetProject,
      app,
      authMode: 'emulator',
    };
  }

  // Strategy 2: Service Account JSON (FIREBASE_SERVICE_ACCOUNT)
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountRaw) {
    let sa: any;
    try {
      sa = JSON.parse(serviceAccountRaw.trim());
    } catch {
      try {
        const decoded = Buffer.from(serviceAccountRaw.trim(), 'base64').toString('utf-8');
        sa = JSON.parse(decoded);
      } catch {
        throw new SafetyAbortError('FIREBASE_SERVICE_ACCOUNT contains invalid JSON / base64 string.');
      }
    }

    if (sa?.private_key) {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    }

    if (sa.project_id && sa.project_id !== targetProject) {
      throw new SafetyAbortError(
        `Target project mismatch: Service account project_id '${sa.project_id}' ` +
        `does not match expected project '${targetProject}'.`
      );
    }

    const app = initializeApp(
      {
        credential: cert(sa),
        projectId: targetProject,
      },
      appName
    );

    return {
      auth: getAuth(app),
      db: getFirestore(app),
      operator: {
        id: sa.client_email || 'service-account-admin',
        name: sa.client_email || 'Service Account Admin',
        role: 'admin',
      },
      projectId: targetProject,
      app,
      authMode: 'service_account',
    };
  }

  // Strategy 3: Google Application Default Credentials (ADC)
  // Supported standard mechanism for both Firebase Auth and Firestore Admin SDK.
  const adcFilePath = getAdcCredentialsPath();
  const hasAdc = Boolean(adcFilePath) || options?.forceAdc;

  if (hasAdc) {
    let operatorEmail = 'adc-admin';
    if (adcFilePath && fs.existsSync(adcFilePath)) {
      try {
        const raw = fs.readFileSync(adcFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.project_id && parsed.project_id !== targetProject) {
          throw new SafetyAbortError(
            `Target project mismatch: Application Default Credentials project_id '${parsed.project_id}' ` +
            `does not match expected project '${targetProject}'.`
          );
        }
        operatorEmail = parsed.account || parsed.client_email || 'adc-admin';
      } catch (err: any) {
        if (err instanceof SafetyAbortError) throw err;
        // Non-fatal metadata read error; applicationDefault() will handle credential validation
      }
    }

    const app = initializeApp(
      {
        credential: applicationDefault(),
        projectId: targetProject,
      },
      appName
    );

    return {
      auth: getAuth(app),
      db: getFirestore(app),
      operator: {
        id: operatorEmail,
        name: operatorEmail !== 'adc-admin' ? operatorEmail : 'Google ADC Administrator',
        role: 'admin',
      },
      projectId: targetProject,
      app,
      authMode: 'adc',
    };
  }

  // Fail closed if no trusted credentials available
  throw new SafetyAbortError(
    `Administrative credentials unavailable for project '${targetProject}'.\n\n` +
    `Supported credential strategies:\n` +
    `1. Google Application Default Credentials (ADC) — Recommended for local administrative use:\n` +
    `   Run: gcloud auth application-default login\n` +
    `   This configures authorized credentials that Firebase Admin SDK natively uses for both\n` +
    `   Firebase Authentication and Firestore without creating service-account JSON keys.\n` +
    `   Required IAM roles on the operator account: roles/firebaseauth.admin (or roles/firebase.admin)\n` +
    `   and roles/datastore.user (or roles/owner / roles/editor).\n\n` +
    `2. Service Account — Set FIREBASE_SERVICE_ACCOUNT with authorized service-account JSON.\n\n` +
    `3. Local Emulators — Set VITE_USE_FIREBASE_EMULATORS=true or configure local emulator hosts.`
  );
}
