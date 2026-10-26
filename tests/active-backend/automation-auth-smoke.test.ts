/**
 * Unit tests for scripts/automation/smokeTestAuth.ts
 *
 * Verifies that the smoke test:
 *   1. Fails safely when FIREBASE_AUTOMATION_API_KEY is missing or blank.
 *   2. Aborts immediately if the automation user document does not exist (no writes).
 *   3. Aborts immediately if the automation user document has wrong role or isActive!=true.
 *   4. Never invokes set/update/create on the user document.
 *   5. Successfully executes preflight, mint, sign-in, token refresh, and read-only getDoc when valid.
 *   6. Throws a helpful diagnostic if referer restrictions block authentication.
 *   7. Intercepts token refresh or Firestore read failures.
 *   8. Never logs secret values.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const mockGetApps = vi.fn(() => []);
  const mockInitializeApp = vi.fn();
  const mockCert = vi.fn((sa: unknown) => ({ type: 'cert', sa }));

  const mockCreateCustomToken = vi.fn().mockResolvedValue('mock-custom-token-xyz');
  const mockGetAuth = vi.fn(() => ({ createCustomToken: mockCreateCustomToken }));

  const mockUserDocGet = vi.fn();
  const mockUserDocSet = vi.fn().mockResolvedValue(undefined);
  const mockUserDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockUserDocRef = {
    get: mockUserDocGet,
    set: mockUserDocSet,
    update: mockUserDocUpdate,
  };
  const mockCollection = vi.fn(() => ({
    doc: vi.fn(() => mockUserDocRef),
  }));
  const mockGetFirestore = vi.fn(() => ({ collection: mockCollection }));

  const mockGetIdToken = vi.fn().mockResolvedValue('mock-refreshed-id-token');
  const mockSignInWithCustomToken = vi.fn().mockResolvedValue({
    user: {
      uid: 'automation-service-account',
      getIdToken: mockGetIdToken,
    },
  });
  const mockSignOut = vi.fn().mockResolvedValue(undefined);

  const mockDoc = vi.fn((_db, coll, id) => ({ path: `${coll}/${id}` }));
  const mockGetDoc = vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ operations: {} }),
  });

  return {
    mockGetApps,
    mockInitializeApp,
    mockCert,
    mockCreateCustomToken,
    mockGetAuth,
    mockUserDocGet,
    mockUserDocSet,
    mockUserDocUpdate,
    mockUserDocRef,
    mockCollection,
    mockGetFirestore,
    mockGetIdToken,
    mockSignInWithCustomToken,
    mockSignOut,
    mockDoc,
    mockGetDoc,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('firebase-admin/app', () => ({
  getApps: mocks.mockGetApps,
  initializeApp: mocks.mockInitializeApp,
  cert: mocks.mockCert,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: mocks.mockGetAuth,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mocks.mockGetFirestore,
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: mocks.mockSignInWithCustomToken,
  signOut: mocks.mockSignOut,
}));

vi.mock('firebase/firestore', () => ({
  doc: mocks.mockDoc,
  getDoc: mocks.mockGetDoc,
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: { name: 'mock-client-auth' },
  db: { name: 'mock-client-db' },
}));

// Subject under test
import { runAuthSmokeTest } from '../../scripts/automation/smokeTestAuth';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const VALID_SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'my-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@my-project.iam.gserviceaccount.com',
  client_id: '123',
};
const VALID_SA_JSON = JSON.stringify(VALID_SERVICE_ACCOUNT);

function setEnv(overrides: Record<string, string | undefined>) {
  const original: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  return () => {
    for (const [key, val] of Object.entries(original)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

describe('scripts/automation/smokeTestAuth.ts', () => {
  let restoreEnv: () => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetApps.mockReturnValue([]);

    // Default healthy preflight response
    mocks.mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        role: 'admin',
        isActive: true,
      }),
    });

    mocks.mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ operations: {} }),
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  // 1. Missing or blank API key fails safely
  it('fails safely when FIREBASE_AUTOMATION_API_KEY is missing', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: undefined,
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      '[Smoke Test] FIREBASE_AUTOMATION_API_KEY is missing or blank'
    );
  });

  it('fails safely when FIREBASE_AUTOMATION_API_KEY is blank or whitespace', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: '   ',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      '[Smoke Test] FIREBASE_AUTOMATION_API_KEY is missing or blank'
    );
  });

  // 2. Preflight stops without write if user document does not exist
  it('aborts immediately without any writes when user document does not exist', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockUserDocGet.mockResolvedValueOnce({
      exists: false,
      data: () => undefined,
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      "[Smoke Test] Preflight failed: user document '/users/automation-service-account' does not exist."
    );

    // Verify ZERO writes occurred
    expect(mocks.mockUserDocSet).not.toHaveBeenCalled();
    expect(mocks.mockUserDocUpdate).not.toHaveBeenCalled();
    // Verify execution did not proceed to minting tokens or signing in
    expect(mocks.mockCreateCustomToken).not.toHaveBeenCalled();
    expect(mocks.mockSignInWithCustomToken).not.toHaveBeenCalled();
  });

  // 3. Preflight stops without write if user role is not admin
  it('aborts immediately without writes when user document role is not admin', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockUserDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'customer', isActive: true }),
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      "[Smoke Test] Preflight failed: user document '/users/automation-service-account' has invalid role 'customer'."
    );

    expect(mocks.mockUserDocSet).not.toHaveBeenCalled();
    expect(mocks.mockCreateCustomToken).not.toHaveBeenCalled();
  });

  // 4. Preflight stops without write if user isActive is false
  it('aborts immediately without writes when user is inactive', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockUserDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'admin', isActive: false }),
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      "[Smoke Test] Preflight failed: user document '/users/automation-service-account' is not active (isActive != true)."
    );

    expect(mocks.mockUserDocSet).not.toHaveBeenCalled();
    expect(mocks.mockCreateCustomToken).not.toHaveBeenCalled();
  });

  // 5. Successful end-to-end execution
  it('executes full sequence: preflight, token mint, sign-in, token refresh, getDoc, signOut', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await expect(runAuthSmokeTest()).resolves.toBeUndefined();

    // Verify preflight read
    expect(mocks.mockUserDocGet).toHaveBeenCalledTimes(1);
    expect(mocks.mockUserDocSet).not.toHaveBeenCalled();
    expect(mocks.mockUserDocUpdate).not.toHaveBeenCalled();

    // Verify token minting
    expect(mocks.mockCreateCustomToken).toHaveBeenCalledWith('automation-service-account');

    // Verify Web Client SDK sign-in
    expect(mocks.mockSignInWithCustomToken).toHaveBeenCalledWith(
      expect.anything(),
      'mock-custom-token-xyz'
    );

    // Verify forced token refresh (validates Token Service API)
    expect(mocks.mockGetIdToken).toHaveBeenCalledWith(true);

    // Verify read-only settings getDoc
    expect(mocks.mockDoc).toHaveBeenCalledWith(expect.anything(), 'settings', 'business');
    expect(mocks.mockGetDoc).toHaveBeenCalledTimes(1);

    // Verify clean sign-out
    expect(mocks.mockSignOut).toHaveBeenCalledTimes(1);
  });

  // 6. Diagnostic error on referer restrictions
  it('throws descriptive diagnostic when referer restriction blocks Web Client sign-in', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'restricted-browser-key',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockSignInWithCustomToken.mockRejectedValueOnce({
      code: 'auth/requests-from-referer-<empty>-are-blocked',
      message: 'Requests from referer <empty> are blocked.',
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      '[Smoke Test] Authentication blocked: requests from referer <empty> are blocked. ' +
      'Ensure FIREBASE_AUTOMATION_API_KEY is configured in GitHub Secrets with a dedicated API key that does not have HTTP website referrer restrictions.'
    );
  });

  // 7. Token refresh error handling
  it('throws descriptive error if ID-token refresh fails', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockGetIdToken.mockRejectedValueOnce({
      code: 'auth/network-request-failed',
      message: 'Network request failed on token refresh',
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      '[Smoke Test] Token refresh failed (Token Service API): auth/network-request-failed'
    );
  });

  // 8. Firestore read error handling
  it('throws descriptive error if Firestore read under client session fails', async () => {
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: 'valid-test-key-123',
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    mocks.mockGetDoc.mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });

    await expect(runAuthSmokeTest()).rejects.toThrow(
      '[Smoke Test] Firestore read failed under security rules: permission-denied'
    );
  });

  // 9. Log sanitization
  it('never logs secrets, credentials, or custom tokens during execution', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const secretApiKey = 'SUPER_SECRET_AUTOMATION_API_KEY_1234567890';
    restoreEnv = setEnv({
      FIREBASE_AUTOMATION_API_KEY: secretApiKey,
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await runAuthSmokeTest();

    for (const call of consoleSpy.mock.calls) {
      const output = call.join(' ');
      expect(output).not.toContain(secretApiKey);
      expect(output).not.toContain('mock-custom-token-xyz');
      expect(output).not.toContain('MIIE');
    }

    consoleSpy.mockRestore();
  });
});
