import { Timestamp } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { serverTimestamp } from 'firebase/firestore';
import { isRole, type Role } from '@/shared/constants/roles';
import type { UserProfile } from '@/shared/types';
import { signOutUser } from '../services/authService';
import type { AuthContextValue, AuthStatus } from '../types/auth.types';
import { AuthContext } from './authContextInstance';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Contract consumers can rely on:
 *  - status 'loading': we don't yet know if anyone is signed in. Never
 *    render app content or redirect to /login during this state.
 *  - status 'unauthenticated': definitely no one signed in.
 *  - status 'authenticated': we know the uid AND the role (from the ID
 *    token's custom claim). `profile` (the Firestore document) may still
 *    be `null` for a brief moment after this — its own onSnapshot
 *    subscription hasn't delivered a first snapshot yet — so treat
 *    `profile === null` here as "still loading the profile", not "no
 *    profile exists".
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Resolve who's signed in via Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setError(null);
        setFirebaseUser(user);

        if (!user) {
          setRole(null);
          setStatus('unauthenticated');
        }
      },
      (err) => {
        console.error('[auth] onAuthStateChanged error:', err);
        setError('Something went wrong with authentication.');
        setStatus('unauthenticated');
      }
    );
    return unsubscribe;
  }, []);

  // 2. Fetch their Firestore profile to determine their Role (Phase 3: No Custom Claims)
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setProfile(null);
      setRole(null);
      return;
    }

    // We are signed in, but waiting for the profile to establish the role
    setStatus('loading');

    // Safety timeout: if the profile hasn't resolved within 8 seconds (e.g. race
    // condition where Google Sign-In fires onAuthStateChanged before the Firestore
    // user doc has been created), try creating the profile once more and if that
    // also fails, sign out so the user isn't stuck on a loading screen forever.
    const timeoutId = setTimeout(async () => {
      try {
        const existing = await userRepository.getById(uid);
        if (!existing && firebaseUser) {
          // Profile still missing — create it now as a fallback
          await userRepository.create({
            role: 'customer',
            fullName: firebaseUser.displayName || 'New User',
            email: firebaseUser.email || '',
            phone: firebaseUser.phoneNumber || '',
            photoUrl: firebaseUser.photoURL || null,
            isActive: true,
            addresses: [],
            defaultAddressId: null,
            createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
            updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
          } as Omit<UserProfile, 'id'>, uid);
          // The onSnapshot below will pick up the newly-created doc automatically
        } else if (!existing) {
          // No user and no profile — sign out
          console.error('[auth] Profile timeout: no profile found, signing out.');
          setError('Could not load your profile. Please try signing in again.');
          await signOutUser();
        }
      } catch (e) {
        console.error('[auth] Profile timeout fallback failed:', e);
        setError('Could not load your profile. Please try signing in again.');
        setStatus('unauthenticated');
      }
    }, 8000);

    const unsubscribe = userRepository.subscribeToDoc(
      uid,
      (data) => {
        setProfile(data);
        if (data && isRole(data.role)) {
          clearTimeout(timeoutId);
          setRole(data.role);
          setStatus('authenticated');
        }
        // If data is null (profile not yet created), we wait — the timeout above
        // will handle the case where it never arrives.
      },
      (err) => {
        clearTimeout(timeoutId);
        console.error('[auth] Failed to subscribe to user profile:', err);
        setError('Could not load your profile.');
        setStatus('unauthenticated');
      }
    );
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [firebaseUser, firebaseUser?.uid, firebaseUser?.email, firebaseUser?.displayName, firebaseUser?.phoneNumber, firebaseUser?.photoURL]);



  const value: AuthContextValue = { status, firebaseUser, profile, role, error, signOut: signOutUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
