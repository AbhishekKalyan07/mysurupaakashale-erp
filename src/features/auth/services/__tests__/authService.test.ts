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

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  updateProfile: mockUpdateProfile,
  signOut: mockSignOut,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  writeBatch: mockWriteBatch,
  serverTimestamp: mockServerTimestamp,
  Timestamp: { now: vi.fn() },
  runTransaction: mockRunTransaction
}));

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

import { signUpCustomer } from '../authService';

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
  });

  it('cleans up and deletes Auth user if getDoc throws an error', async () => {
    mockGetDoc.mockRejectedValue(new Error('Firestore unavailable'));
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('Firestore unavailable');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled(); // User delete succeeded
  });

  it('cleans up and deletes Auth user if phone already exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true });
    
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
    // Batch commit should NOT have been called because updateProfile failed
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it('cleans up and deletes Auth user if transaction commit throws an error', async () => {
    mockRunTransaction.mockRejectedValue(new Error('Transaction commit failed'));

    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '9876543210'))
      .rejects.toThrow('Transaction commit failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it('signs out the user if credential.user.delete() fails during cleanup', async () => {
    mockRunTransaction.mockRejectedValue(new Error('Transaction commit failed'));
    mockUserDelete.mockRejectedValue(new Error('Auth user deletion failed (requires recent login)'));
    
    await expect(signUpCustomer('test@test.com', 'password', 'Test User', '+1234567890'))
      .rejects.toThrow('Transaction commit failed');
      
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    // Fallback cleanup
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
