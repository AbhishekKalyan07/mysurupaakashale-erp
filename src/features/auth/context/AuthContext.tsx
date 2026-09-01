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
function getInitialState(): { status: AuthStatus; role: Role | null; uid: string | null } {
  try {
    const lastUid = localStorage.getItem('last_active_uid');
    if (lastUid) {
      const rawCache = localStorage.getItem(`auth_cache_${lastUid}`);
      if (rawCache) {
        const parsed = JSON.parse(rawCache);
        if (parsed && parsed.uid === lastUid && isRole(parsed.role)) {
          return { status: 'authenticated', role: parsed.role as Role, uid: lastUid };
        }
      }
    }
  } catch (_err) {
    // Ignore invalid JSON or blocked localStorage
  }
  return { status: 'loading', role: null, uid: null };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [init] = useState(getInitialState);
  const [status, setStatus] = useState<AuthStatus>(init.status);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<Role | null>(init.role);
  const [error, setError] = useState<string | null>(null);

  // 1. Resolve who's signed in via Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setError(null);
        setFirebaseUser(user);

        if (!user) {
          try {
            localStorage.removeItem('last_active_uid');
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.startsWith('auth_cache_') || key.startsWith('pwa_'))) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));
          } catch (_e) {}
          setRole(null);
          setProfile(null);
          setStatus('unauthenticated');
        } else {
          try { localStorage.setItem('last_active_uid', user.uid); } catch (_e) {}
          // Check if we are already optimistically authenticated with the same UID
          if (init.status === 'authenticated' && init.uid === user.uid) {
            // Already showing UI; do not revert to loading. Wait for authoritative profile.
          } else {
            // Fallback: check cache just in case last_active_uid was missing
            try {
              const rawCache = localStorage.getItem(`auth_cache_${user.uid}`);
              if (rawCache) {
                const parsed = JSON.parse(rawCache);
                if (parsed && parsed.uid === user.uid && isRole(parsed.role)) {
                  setRole(parsed.role as Role);
                  setStatus('authenticated');
                } else {
                  setStatus('loading');
                }
              } else {
                setStatus('loading');
              }
            } catch (_err) {
              setStatus('loading');
            }
          }
        }
      },
      (err) => {
        console.error('[auth] onAuthStateChanged error:', err);
        setError('Something went wrong with authentication.');
        setStatus('unauthenticated');
      }
    );
    return unsubscribe;
  }, [init.status, init.uid]);

  // 2. Fetch their Firestore profile to determine their Role (Phase 3: No Custom Claims)
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setProfile(null);
      return;
    }

    // We are signed in, but waiting for the profile to establish the role
    // ONLY set loading if we didn't already resolve the role from localStorage cache.
    setStatus((prev) => (prev !== 'authenticated' ? 'loading' : prev));

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

    if (import.meta.env.DEV) {
      console.log('[auth] Subscribing to UID:', uid);
    }
    const unsubscribe = userRepository.subscribeToDoc(
      uid,
      (data) => {
        if (import.meta.env.DEV) {
          console.log('[auth] Received profile data:', data);
        }
        if (data && data.isActive === false) {
          clearTimeout(timeoutId);
          setError('Your account has been deactivated. Please contact support.');
          signOutUser().catch(() => setStatus('unauthenticated'));
          return;
        }

        setProfile(data);

        if (data && isRole(data.role)) {
          clearTimeout(timeoutId);
          // Persist the authoritative role to cache for the next cold boot
          try {
            localStorage.setItem(
              `auth_cache_${uid}`,
              JSON.stringify({ uid, role: data.role })
            );
          } catch (_e) {
            // Ignore localStorage quota/blocking errors
          }

          setRole((prev) => (prev !== data.role ? data.role : prev));
          setStatus((prev) => (prev !== 'authenticated' ? 'authenticated' : prev));
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
  // 3. Signal that critical startup (Auth + Profile resolution) is complete
  useEffect(() => {
    if (status !== 'loading') {
      // Give React and any lazy-loaded routes enough time to mount and
      // fetch their initial data before firing the telemetry initialization event.
      // 5 seconds guarantees the dashboard is fully populated.
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('app-ready'));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const value: AuthContextValue = { status, firebaseUser, profile, role, error, signOut: signOutUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
