import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { userRepository } from '@/shared/services/firestore/userRepository';
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
        } else {
          setStatus('loading');
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

    // Safety timeout: if the Firestore subscription hasn't resolved after an
    // extended wait, sign out so the user isn't stuck on a loading screen.
    // We intentionally do NOT create a fallback profile here — doing so would
    // overwrite legitimate role-specific profiles (e.g. admin) with 'customer',
    // breaking both production UX and E2E tests. The subscription will fire as
    // soon as Firestore connects; we just need to give it enough time.
    const timeoutId = setTimeout(async () => {
      console.error('[auth] Profile load timed out after 20s — signing out.');
      setError('Could not load your profile. Please try signing in again.');
      try {
        await signOutUser();
      } catch {
        setStatus('unauthenticated');
      }
    }, 20000);

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
