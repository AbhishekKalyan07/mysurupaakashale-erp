import { describe, it, expect, vi } from 'vitest';
import { extractErrorMessage, withErrorHandling } from '../errorHandler';
import { FirebaseError } from 'firebase/app';
import { toast } from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('extractErrorMessage', () => {
  it('extracts known Firebase error codes', () => {
    const cases: Record<string, string> = {
      'permission-denied': 'You do not have permission to perform this action.',
      'unauthenticated': 'Please log in to continue.',
      'not-found': 'The requested record was not found.',
      'already-exists': 'This record already exists.',
      'failed-precondition': 'Action cannot be completed in the current state.',
      'resource-exhausted': 'System is busy. Please try again later.',
      'unavailable': 'Service is temporarily offline. Please check your internet connection.',
      'internal': 'An internal server error occurred. Our team has been notified.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/email-already-in-use': 'An account with this email already exists.',
    };
    for (const [code, expected] of Object.entries(cases)) {
      expect(extractErrorMessage(new FirebaseError(code, 'msg'))).toBe(expected);
    }
  });

  it('strips FirebaseError prefix for unknown codes', () => {
    const error = new FirebaseError('unknown', 'FirebaseError: Some strange error');
    expect(extractErrorMessage(error)).toBe('Some strange error');
  });

  it('handles standard JS Errors', () => {
    const error = new Error('Standard error message');
    expect(extractErrorMessage(error)).toBe('Standard error message');
  });

  it('returns default message for non-error objects', () => {
    expect(extractErrorMessage('string error')).toBe('An unexpected error occurred.');
    expect(extractErrorMessage({ some: 'object' }, 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('withErrorHandling', () => {
  it('returns result on success', async () => {
    const promise = Promise.resolve('success');
    await expect(withErrorHandling(promise)).resolves.toBe('success');
  });

  it('catches error, toasts, and rethrows on failure', async () => {
    const promise = Promise.reject(new Error('Test failure'));
    await expect(withErrorHandling(promise)).rejects.toThrow('Test failure');
    expect(toast.error).toHaveBeenCalledWith('Test failure');
  });

  it('respects showToast: false', async () => {
    const promise = Promise.reject(new Error('Silent failure'));
    await expect(withErrorHandling(promise, { showToast: false })).rejects.toThrow('Silent failure');
    expect(toast.error).not.toHaveBeenCalledWith('Silent failure');
  });
});
