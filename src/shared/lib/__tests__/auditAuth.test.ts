import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateReadOnlyForAudit } from '../../../../scripts/automation/auditAuth';

const mockGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));
const mockGetFirestore = vi.fn(() => ({ collection: mockCollection }));
const mockCreateCustomToken = vi.fn().mockResolvedValue('mock-custom-token');
const mockGetAuth = vi.fn(() => ({ createCustomToken: mockCreateCustomToken }));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  cert: vi.fn((sa) => sa),
  getApps: vi.fn().mockReturnValue([]),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => mockGetAuth(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn().mockResolvedValue({ user: { uid: 'automation-service-account' } }),
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  db: {
    app: { options: { projectId: 'mysuru-paakashale-erp' } },
  },
}));

describe('Read-Only Audit Authentication (auditAuth.ts)', () => {
  const validServiceAccount = JSON.stringify({
    project_id: 'mysuru-paakashale-erp',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMOCK\\n-----END PRIVATE KEY-----',
    client_email: 'automation@mysuru-paakashale-erp.iam.gserviceaccount.com',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_USE_FIREBASE_EMULATORS = 'false';
    process.env.FIREBASE_AUTOMATION_API_KEY = 'mock-dedicated-automation-key';
    process.env.FIREBASE_SERVICE_ACCOUNT = validServiceAccount;
    process.env.VITE_FIREBASE_PROJECT_ID = 'mysuru-paakashale-erp';
  });

  it('1. rejects when expectedProjectId is missing or empty', async () => {
    await expect(authenticateReadOnlyForAudit('')).rejects.toThrow(
      'An explicit expectedProjectId is required for audit authentication',
    );
  });

  it('2. rejects when FIREBASE_AUTOMATION_API_KEY is missing in non-emulator environment', async () => {
    delete process.env.FIREBASE_AUTOMATION_API_KEY;
    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      'FIREBASE_AUTOMATION_API_KEY is missing or blank',
    );
  });

  it('3. rejects when service account project_id does not match expected project', async () => {
    const mismatchedSA = JSON.stringify({
      project_id: 'wrong-project-id',
      private_key: '-----BEGIN PRIVATE KEY-----\\nMOCK\\n-----END PRIVATE KEY-----',
      client_email: 'automation@wrong-project.iam.gserviceaccount.com',
    });
    process.env.FIREBASE_SERVICE_ACCOUNT = mismatchedSA;

    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      "Service account project_id 'wrong-project-id' does not match expected target project 'mysuru-paakashale-erp'",
    );
  });

  it('3b. rejects when service account is missing project_id field', async () => {
    const missingProjSA = JSON.stringify({
      private_key: '-----BEGIN PRIVATE KEY-----\\nMOCK\\n-----END PRIVATE KEY-----',
      client_email: 'automation@wrong-project.iam.gserviceaccount.com',
    });
    process.env.FIREBASE_SERVICE_ACCOUNT = missingProjSA;

    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      'Service account is missing required project_id field',
    );
  });

  it('4. strictly aborts when /users/automation-service-account does not exist and NEVER repairs it', async () => {
    mockGet.mockResolvedValueOnce({
      exists: false,
      data: () => undefined,
    });

    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      "Preflight failed — user document '/users/automation-service-account' does not exist",
    );
  });

  it('5. strictly aborts when /users/automation-service-account has invalid role', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'customer', isActive: true }),
    });

    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      "has invalid role 'customer'. Expected 'admin'",
    );
  });

  it('6. strictly aborts when /users/automation-service-account is inactive', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'admin', isActive: false }),
    });

    await expect(authenticateReadOnlyForAudit('mysuru-paakashale-erp')).rejects.toThrow(
      'is inactive (isActive != true)',
    );
  });

  it('7. authenticates successfully when all project assertions, secrets, and preflights pass', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'admin', isActive: true }),
    });

    const result = await authenticateReadOnlyForAudit('mysuru-paakashale-erp');
    expect(result.authenticatedUid).toBe('automation-service-account');
    expect(result.projectId).toBe('mysuru-paakashale-erp');
    expect(result.mode).toBe('production_service_account');
    expect(mockCreateCustomToken).toHaveBeenCalledWith('automation-service-account');
  });
});
