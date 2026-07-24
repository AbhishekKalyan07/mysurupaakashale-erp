import { FirebaseError } from 'firebase/app';
import { toast } from 'react-hot-toast';

/**
 * Extracts a user-friendly error message from any caught error.
 */
export function extractErrorMessage(error: unknown, defaultMessage = 'An unexpected error occurred.'): string {
  if (error instanceof FirebaseError) {
    // Prevent raw Firebase error codes (e.g. "auth/network-request-failed") from reaching UI
    switch (error.code) {
      case 'permission-denied':
        return 'You do not have permission to perform this action.';
      case 'unauthenticated':
        return 'Please log in to continue.';
      case 'not-found':
        return 'The requested record was not found.';
      case 'already-exists':
        return 'This record already exists.';
      case 'failed-precondition':
        return 'Action cannot be completed in the current state.';
      case 'resource-exhausted':
        return 'System is busy. Please try again later.';
      case 'unavailable':
        return 'Service is temporarily offline. Please check your internet connection.';
      case 'internal':
        return 'An internal server error occurred. Our team has been notified.';
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      default:
        // Strip out the generic Firebase "FirebaseError: " prefix if present in the message
        return error.message.replace(/^FirebaseError:\s*/, '');
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return defaultMessage;
}

/**
 * Wraps an async repository or function call, extracting a friendly error and optionally toasting it.
 */
export async function withErrorHandling<T>(
  promise: Promise<T>,
  options?: { showToast?: boolean; defaultMessage?: string }
): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    const message = extractErrorMessage(err, options?.defaultMessage);
    if (options?.showToast !== false) {
      toast.error(message);
    }
    throw new Error(message); // Rethrow a standardized error
  }
}
