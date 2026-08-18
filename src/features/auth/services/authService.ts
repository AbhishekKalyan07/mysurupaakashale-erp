import { Timestamp } from 'firebase/firestore';
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
  const msg = (error as { message?: string } | undefined)?.message;

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Sign-in cancelled.';
  }

  return (code && ERROR_MESSAGES[code]) || msg || 'Something went wrong. Please try again.';
}

export async function signIn(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);

  // Check if the user profile exists.
  const profile = await userRepository.getById(credential.user.uid);

  if (!profile) {
    // Automatically create a base customer profile for new Google signups
    const displayId = await userRepository.generateNextDisplayId('customer', credential.user.displayName || 'Google User');
    await userRepository.create({
      displayId,
      role: 'customer',
      fullName: credential.user.displayName || 'Google User',
      email: credential.user.email || '',
      phone: '', // Collect during onboarding
      photoUrl: credential.user.photoURL || null,
      isActive: true,
      addresses: [],
      defaultAddressId: null,
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
      emailVerified: credential.user.emailVerified,
      googleConnected: true,
      passwordCreated: false,
    } as Omit<UserProfile, 'id'>, credential.user.uid);
  } else if (!profile.googleConnected) {
    await userRepository.update(credential.user.uid, {
      googleConnected: true,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    } as any);
  }

  return credential;
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

  // Check if phone number is already registered now that the user is authenticated
  // (Security rules enforce isSignedIn() for the userPhones registry to prevent enumeration).
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const { db } = await import('@/shared/lib/firebase');

  const phoneDocRef = doc(db, 'userPhones', phone);
  const existingPhone = await getDoc(phoneDocRef);

  if (existingPhone.exists()) {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth);
    }
    throw new Error('An account with this mobile number already exists — try signing in instead.');
  }

  const displayId = await userRepository.generateNextDisplayId('customer', fullName);

  // Await the profile updates before navigating, to ensure the profile write
  // reaches the server and avoids race conditions in security rules during checkout.
  await Promise.all([
    updateProfile(credential.user, { displayName: fullName }),
    setDoc(phoneDocRef, { uid: credential.user.uid }),
    userRepository.create({
      displayId,
      role: 'customer',
      fullName,
      email,
      phone,
      photoUrl: null,
      isActive: true,
      addresses: [],
      defaultAddressId: null,
      createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      emailVerified: credential.user.emailVerified,
      googleConnected: false,
      passwordCreated: true,
    } as Omit<UserProfile, 'id'>, credential.user.uid)
  ]).catch(async (error) => {
    console.error('Failed to initialize customer profile:', error);
    try {
      await credential.user.delete();
    } catch (cleanupError) {
      console.error('Failed to clean up auth user after failed initialization:', cleanupError);
    }
    throw error;
  });
  
  return credential;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function authenticateWithGoogleForSignup() {
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  const profile = await userRepository.getById(credential.user.uid);
  return { user: credential.user, exists: !!profile };
}

export async function signUpWithGoogle(user: any, phone: string, password: string): Promise<void> {
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const { signOut: firebaseSignOut, EmailAuthProvider, linkWithCredential } = await import('firebase/auth');
  const { db } = await import('@/shared/lib/firebase');

  const phoneDocRef = doc(db, 'userPhones', phone);
  const existingPhone = await getDoc(phoneDocRef);
  if (existingPhone.exists()) {
    try {
      await user.delete();
    } catch {
      await firebaseSignOut(auth);
    }
    throw new Error('An account with this mobile number already exists.');
  }

  // 1. Link Email/Password credential to Google User
  if (!user.email) {
    throw new Error('Google account is missing an email address.');
  }
  const emailCred = EmailAuthProvider.credential(user.email, password);
  await linkWithCredential(user, emailCred);

  // 2. Save the phone number registry mapping
  await setDoc(phoneDocRef, { uid: user.uid });

  const displayId = await userRepository.generateNextDisplayId('customer', user.displayName || 'Google User');

  await userRepository.create({
    displayId,
    role: 'customer',
    fullName: user.displayName || 'Google User',
    email: user.email,
    phone: phone,
    photoUrl: user.photoURL || null,
    isActive: true,
    addresses: [],
    defaultAddressId: null,
    createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    emailVerified: user.emailVerified,
    googleConnected: true,
    passwordCreated: true,
  } as Omit<UserProfile, 'id'>, user.uid);
}

export async function cancelGoogleSignup(user: any): Promise<void> {
  const { signOut: firebaseSignOut } = await import('firebase/auth');
  try {
    await user.delete();
  } catch {
    await firebaseSignOut(auth);
  }
}
