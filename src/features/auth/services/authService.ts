import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  type UserCredential,
} from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '@/shared/lib/firebase';
import { userRepository } from '@/shared/services/firestore/userRepository';
import type { UserProfile } from '@/shared/types';


const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/user-disabled': 'This account has been disabled. Contact support if that seems wrong.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists — try signing in instead.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
};

/** Turns a raw Firebase Auth error into copy that's safe and useful to show a user. */
export function mapAuthError(error: unknown): string {
  const code = (error as { code?: string } | undefined)?.code;
  return (code && ERROR_MESSAGES[code]) || 'Something went wrong. Please try again.';
}

export async function signIn(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

/**
 * Customer self-signup. The Firestore `users/{uid}` profile (role:
 * 'customer') is already created server-side by the time this resolves —
 * see functions/src/auth/onUserCreate.ts, a blocking function that runs
 * before account creation completes. That function has no access to a
 * display name or phone number (email/password signup doesn't carry
 * either), so this patches both onto the already-created profile as a
 * normal, rules-checked client write (a user updating their own document).
 */
export async function signUpCustomer(
  email: string,
  password: string,
  fullName: string,
  phone: string,
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: fullName });
  
  // Phase 2: Client-side creation instead of Cloud Function
  await userRepository.create({
    role: 'customer',
    fullName,
    email,
    phone,
    photoUrl: null,
    isActive: true,
    addresses: [],
    defaultAddressId: null,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  } as Omit<UserProfile, 'id'>, credential.user.uid);
  
  return credential;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}
