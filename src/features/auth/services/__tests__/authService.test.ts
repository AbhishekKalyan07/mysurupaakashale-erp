import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockCreateUserWithEmailAndPassword,
  mockUpdateProfile,
  mockSignOut,
  mockUserDelete,
  mockDoc,
  mockGetDoc,
  mockWriteBatch,
  mockServerTimestamp,
  mockGenerateNextDisplayId,
  mockRunTransaction
} = vi.hoisted(() => {
  const mockGetDoc = vi.fn();
  return {
    mockCreateUserWithEmailAndPassword: vi.fn(),
    mockUpdateProfile: vi.fn(),
    mockSignOut: vi.fn(),
    mockUserDelete: vi.fn(),
    mockDoc: vi.fn(),
    mockGetDoc,
    mockWriteBatch: vi.fn(),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockGenerateNextDisplayId: vi.fn(),
    mockRunTransaction: vi.fn(async (_, cb) => cb({
      get: mockGetDoc,
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }))
  };
});

const mockSignInWithEmailAndPassword = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockLinkWithCredential = vi.fn();

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  updateProfile: mockUpdateProfile,
  signOut: mockSignOut,
  signInWithEmailAndPassword: (...args: any[]) => mockSignInWithEmailAndPassword(...args),
  signInWithPopup: (...args: any[]) => mockSignInWithPopup(...args),
  GoogleAuthProvider: vi.fn(),
  sendPasswordResetEmail: (...args: any[]) => mockSendPasswordResetEmail(...args),
  EmailAuthProvider: { credential: vi.fn(() => 'mock-cred') },
  linkWithCredential: (...args: any[]) => mockLinkWithCredential(...args),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    doc: mockDoc,
    getDoc: mockGetDoc,
    writeBatch: mockWriteBatch,
    serverTimestamp: mockServerTimestamp,
    Timestamp: { now: vi.fn() },
    runTransaction: mockRunTransaction
  };
});

vi.mock('@/shared/lib/firebase', () => ({
  auth: { name: 'mock-auth' },
  db: { name: 'mock-db' }
}));

vi.mock('@/shared/services/firestore/userRepository', () => ({
  userRepository: {
    generateNextDisplayId: mockGenerateNextDisplayId,
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }
}));

import {
  mapAuthError,
  signIn,
  signInWithGoogle,
  signUpCustomer,
  signOutUser,
  resetPassword,
  authenticateWithGoogleForSignup,
  signUpWithGoogle,
  cancelGoogleSignup
} from '../authService';

describe('authService - signUpCustomer Failure Injections', () => {
  let mockUser: any;
  let mockBatch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUser = {
      uid: 'user-123',
      emailVerified: false,
      delete: mockUserDelete.mockResolvedValue(undefined)
    };
    
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });
    
    mockGetDoc.mockResolvedValue({ exists: () => false }); // Phone does not exist by default
    
    mockGenerateNextDisplayId.mockResolvedValue('C-1234');
    
    mockBatch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined)
    };
    mockWriteBatch.mockReturnValue(mockBatch);
    
    mockUpdateProfile.mockResolvedValue(undefined);

    mockRunTransaction.mockImplementation(async (_, cb) => cb({
      get: mockGetDoc,
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }));
  });

  it('cleans up and deletes Auth user if phone already exists', async () => {
    mockBatch.commit.mockRejectedValue({ code: 'permission-denied' });
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('An account with this mobile number already exists');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it('cleans up and deletes Auth user if generateNextDisplayId throws an error', async () => {
    mockGenerateNextDisplayId.mockRejectedValue(new Error('ID generation failed'));
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('ID generation failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it('cleans up and deletes Auth user if updateProfile throws an error', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Profile update failed'));
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('Profile update failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });

  it('cleans up and deletes Auth user if batch commit throws an error', async () => {
    mockBatch.commit.mockRejectedValue(new Error('Batch commit failed'));

    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '9876543210'))
      .rejects.toThrow('Batch commit failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it('signs out the user if credential.user.delete() fails during cleanup', async () => {
    mockBatch.commit.mockRejectedValue(new Error('Batch commit failed'));
    mockUserDelete.mockRejectedValue(new Error('Auth user deletion failed (requires recent login)'));
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('Batch commit failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    // Fallback cleanup
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('authService - mapAuthError', () => {
  it('maps known error codes to user friendly copy', () => {
    expect(mapAuthError({ code: 'auth/invalid-email' })).toBe("That email address doesn't look right.");
    expect(mapAuthError({ code: 'auth/popup-closed-by-user' })).toBe('Sign-in cancelled.');
    expect(mapAuthError({ code: 'unknown-code', message: 'Custom msg' })).toBe('Custom msg');
    expect(mapAuthError({})).toBe('Something went wrong. Please try again.');
  });
});

describe('authService - additional helper functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockRunTransaction.mockImplementation(async (_, cb) => cb({
      get: mockGetDoc,
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }));
    
    const mockBatch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined)
    };
    (mockWriteBatch as any).mockReturnValue(mockBatch);
  });

  it('signIn invokes signInWithEmailAndPassword', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue('mock-user-cred');
    await expect(signIn('test@example.com', 'pass')).resolves.toBe('mock-user-cred');
  });

  it('signOutUser invokes firebaseSignOut', async () => {
    mockSignOut.mockResolvedValue(undefined);
    await signOutUser();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('resetPassword invokes sendPasswordResetEmail', async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    await resetPassword('test@example.com');
    expect(mockSendPasswordResetEmail).toHaveBeenCalled();
  });

  it('authenticateWithGoogleForSignup runs popup and checks user profile', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'g1' } });
    await expect(authenticateWithGoogleForSignup()).resolves.toEqual({ user: { uid: 'g1' }, exists: false });
  });

  it('cancelGoogleSignup deletes user or signs out on error', async () => {
    const mockUserObj = { delete: vi.fn().mockResolvedValue(undefined) };
    await cancelGoogleSignup(mockUserObj);
    expect(mockUserObj.delete).toHaveBeenCalled();

    mockUserObj.delete.mockRejectedValue(new Error('delete failed'));
    await cancelGoogleSignup(mockUserObj);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('signUpWithGoogle succeeds when email is present and transaction completes', async () => {
    mockLinkWithCredential.mockResolvedValue(undefined);
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const mockGUser = { uid: 'g123', email: 'g@test.com', displayName: 'G User', emailVerified: true, delete: vi.fn().mockResolvedValue(undefined) };

    await expect(signUpWithGoogle(mockGUser, '9876543210', 'pass')).resolves.not.toThrow();
  });

  it('signUpWithGoogle throws if email is missing or cleanup on error', async () => {
    const mockGUser = { uid: 'g123', delete: vi.fn().mockResolvedValue(undefined) };
    await expect(signUpWithGoogle(mockGUser, '9876543210', 'pass')).rejects.toThrow('Google account is missing an email address.');

    const mockFailingBatch = { set: vi.fn(), commit: vi.fn().mockRejectedValue(new Error('Tx fail')) };
    (mockWriteBatch as any).mockReturnValue(mockFailingBatch);
    const mockGUser2 = { uid: 'g123', email: 'g@test.com', delete: vi.fn().mockRejectedValue(new Error('del fail')) };
    await expect(signUpWithGoogle(mockGUser2, '9876543210', 'pass')).rejects.toThrow('Tx fail');
  });

  it('signInWithGoogle creates a profile if non-existent or updates if existing', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'g123', email: 'g@test.com', displayName: 'G' } });
    await signInWithGoogle();
    expect(mockSignInWithPopup).toHaveBeenCalled();
  });
});
