/**
 * Unit tests for scripts/automation/auth.ts
 *
 * These run via `npm run test:integration` (vitest run tests/active-backend)
 * without needing real Firebase credentials or a live emulator.
 * All Firebase SDK calls are mocked.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that trigger side-effects
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const mockGetApps = vi.fn(() => []);
  const mockInitializeApp = vi.fn();
  const mockCert = vi.fn((sa: unknown) => ({ type: 'cert', sa }));

  const mockCreateCustomToken = vi.fn().mockResolvedValue('mock-custom-token');
  const mockGetAuth = vi.fn(() => ({ createCustomToken: mockCreateCustomToken }));

  const mockUserDocGet = vi.fn();
  const mockUserDocSet = vi.fn().mockResolvedValue(undefined);
  const mockUserDocRef = { get: mockUserDocGet, set: mockUserDocSet };
  const mockCollection = vi.fn(() => ({
    doc: vi.fn(() => mockUserDocRef),
  }));
  const mockGetFirestore = vi.fn(() => ({ collection: mockCollection }));

  const mockServerTimestamp = vi.fn(() => 'SERVER_TIMESTAMP');
  const MockFieldValue = {
    serverTimestamp: mockServerTimestamp,
  };

  const mockSignInWithCustomToken = vi.fn().mockResolvedValue({
    user: { uid: 'automation-service-account', email: null },
  });

  return {
    mockGetApps,
    mockInitializeApp,
    mockCert,
    mockCreateCustomToken,
    mockGetAuth,
    mockUserDocGet,
    mockUserDocSet,
    mockUserDocRef,
    mockCollection,
    mockGetFirestore,
    mockServerTimestamp,
    MockFieldValue,
    mockSignInWithCustomToken,
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
  FieldValue: mocks.MockFieldValue,
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: { name: 'mock-client-auth' },
  db: { name: 'mock-client-db' },
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: mocks.mockSignInWithCustomToken,
}));

// env.ts is a side-effect shim — mock it as a no-op
vi.mock('../../scripts/automation/env', () => ({}));

// ---------------------------------------------------------------------------
// Import subject under test (after mocks are in place)
// ---------------------------------------------------------------------------
import { authenticateForAutomation } from '../../scripts/automation/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'my-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@my-project.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};
const VALID_SA_JSON = JSON.stringify(VALID_SERVICE_ACCOUNT);
const VALID_SA_BASE64 = Buffer.from(VALID_SA_JSON).toString('base64');

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
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('authenticateForAutomation()', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no apps initialized, admin role upsert needed
    mocks.mockGetApps.mockReturnValue([]);
    mocks.mockUserDocGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    });
  });

  afterEach(() => {
    restoreEnv?.();
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  // ── 1. Missing credentials (non-emulator) ────────────────────────────────
  it('throws a clear error when FIREBASE_SERVICE_ACCOUNT is missing and not in emulator mode', async () => {
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: undefined,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await expect(authenticateForAutomation()).rejects.toThrow(
      'Automation credentials missing.'
    );
    expect(mocks.mockInitializeApp).not.toHaveBeenCalled();
  });

  // ── 2. Raw JSON secret ────────────────────────────────────────────────────
  it('initializes firebase-admin and authenticates using a raw JSON service account', async () => {
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await authenticateForAutomation();

    expect(mocks.mockCert).toHaveBeenCalledWith(
      expect.objectContaining({ client_email: VALID_SERVICE_ACCOUNT.client_email })
    );
    expect(mocks.mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mocks.mockCreateCustomToken).toHaveBeenCalledWith('automation-service-account');
    expect(mocks.mockSignInWithCustomToken).toHaveBeenCalledWith(
      expect.anything(),
      'mock-custom-token'
    );
  });

  // ── 3. Base64-encoded JSON secret ─────────────────────────────────────────
  it('decodes and parses a base64-encoded service account secret', async () => {
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_BASE64,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await authenticateForAutomation();

    expect(mocks.mockCert).toHaveBeenCalledWith(
      expect.objectContaining({ client_email: VALID_SERVICE_ACCOUNT.client_email })
    );
    expect(mocks.mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  // ── 4. Invalid secret format ───────────────────────────────────────────────
  it('throws a descriptive error when secret is neither JSON nor base64', async () => {
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: 'not-json-not-base64!!!@@',
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await expect(authenticateForAutomation()).rejects.toThrow(
      'FIREBASE_SERVICE_ACCOUNT is neither valid JSON nor valid base64-encoded JSON.'
    );
  });

  // ── 5. Emulator mode — no service account needed ──────────────────────────
  it('initializes with projectId only when in emulator mode and no service account provided', async () => {
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: undefined,
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-test',
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
      FIRESTORE_EMULATOR_HOST: undefined,
    });

    await authenticateForAutomation();

    expect(mocks.mockCert).not.toHaveBeenCalled();
    expect(mocks.mockInitializeApp).toHaveBeenCalledWith({ projectId: 'demo-test' });
    expect(mocks.mockCreateCustomToken).toHaveBeenCalled();
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
  });

  // ── 6. Skips re-initializing Admin when already initialized ───────────────
  it('skips initializeApp when firebase-admin is already initialized', async () => {
    mocks.mockGetApps.mockReturnValue([{ name: '[DEFAULT]' }] as unknown as never[]);
    restoreEnv = setEnv({
      FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    });

    await authenticateForAutomation();

    expect(mocks.mockInitializeApp).not.toHaveBeenCalled();
    // Should still authenticate and check the user doc
    expect(mocks.mockCreateCustomToken).toHaveBeenCalledTimes(1);
  });

  // ── 7. Upserts admin doc when user doc doesn't exist ─────────────────────
  it('upserts admin role document when user doc does not exist', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({ exists: false, data: () => undefined });

    await authenticateForAutomation();

    expect(mocks.mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        isActive: true,
        firstName: 'Automation',
        email: VALID_SERVICE_ACCOUNT.client_email,
      }),
      { merge: true }
    );
  });

  // ── 8. Upserts admin doc when user doc exists but has wrong role or isActive: false ──
  it('upserts admin role document when user doc exists but has wrong role', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'customer', isActive: true }),
    });

    await authenticateForAutomation();

    expect(mocks.mockUserDocSet).toHaveBeenCalled();
  });

  it('upserts admin role document when user doc has admin role but isActive is false', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin', isActive: false }),
    });

    await authenticateForAutomation();

    expect(mocks.mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        isActive: true,
      }),
      { merge: true }
    );
  });

  // ── 9. Skips upsert when user doc already has admin role and is active ────
  it('skips upsert when user doc already has role === "admin" and isActive === true', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin', isActive: true }),
    });

    await authenticateForAutomation();

    expect(mocks.mockUserDocSet).not.toHaveBeenCalled();
  });

  // ── 10. FieldValue.serverTimestamp used in upsert ────────────────────────
  it('uses FieldValue.serverTimestamp() for createdAt and updatedAt when creating new doc', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({ exists: false, data: () => undefined });

    await authenticateForAutomation();

    expect(mocks.mockServerTimestamp).toHaveBeenCalledTimes(1);
    expect(mocks.mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true }
    );
  });

  it('preserves createdAt and only updates updatedAt when updating an existing user doc', async () => {
    restoreEnv = setEnv({ FIREBASE_SERVICE_ACCOUNT: VALID_SA_JSON, VITE_USE_FIREBASE_EMULATORS: undefined });
    mocks.mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'customer', isActive: true }),
    });

    await authenticateForAutomation();

    expect(mocks.mockUserDocSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ createdAt: expect.anything() }),
      { merge: true }
    );
  });
});
