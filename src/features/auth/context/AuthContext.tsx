import { useEffect, useState, useRef, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { isRole, type Role } from "@/shared/constants/roles";
import type { UserProfile } from "@/shared/types";
import {
  signOutUser,
  handleGoogleRedirectResult,
} from "../services/authService";
import type { AuthContextValue, AuthStatus } from "../types/auth.types";
import { AuthContext } from "./authContextInstance";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Contract consumers can rely on:
 *  - status 'loading': we don't yet know if anyone is signed in. Never
 *    render app content or redirect to /login during this state.
 *  - status 'unauthenticated': definitely no one signed in.
 *  - status 'authenticated': we know the uid AND the authoritative role (from
 *    cache or Firestore). `profile` may still be updating in the background.
 */
function getInitialState(): {
  status: AuthStatus;
  role: Role | null;
  uid: string | null;
} {
  try {
    const lastUid =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("last_active_uid")
        : null;
    if (lastUid) {
      const cached = localStorage.getItem(`auth_cache_${lastUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.uid === lastUid && isRole(parsed.role)) {
          return { status: "loading", role: parsed.role, uid: lastUid };
        }
      }
    }
  } catch {}
  return { status: "loading", role: null, uid: null };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [init] = useState(getInitialState);
  const [status, setStatus] = useState<AuthStatus>(init.status);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<Role | null>(init.role);
  const [error, setError] = useState<string | null>(null);
  const preservedErrorRef = useRef<boolean>(false);

  // 0. Handle Google Sign-In Redirects (PWA/Mobile)
  useEffect(() => {
    // If the user just completed a Google sign in via redirect (e.g. in the PWA),
    // this will capture the result and ensure their Firestore profile is created.
    handleGoogleRedirectResult().catch((err: any) => {
      console.error("[auth] Redirect error:", err);
      setError(
        err?.message ||
          "Authentication failed. Please check your browser settings or try again.",
      );
    });
  }, []);

  // 1. Resolve who's signed in via Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!preservedErrorRef.current) {
          setError(null);
        } else {
          preservedErrorRef.current = false;
        }
        setFirebaseUser(user);

        if (!user) {
          try {
            localStorage.removeItem("last_active_uid");
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (
                key &&
                (key.startsWith("auth_cache_") || key.startsWith("pwa_"))
              ) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));
          } catch {}
          setRole(null);
          setProfile(null);
          setStatus("unauthenticated");
        } else {
          try {
            localStorage.setItem("last_active_uid", user.uid);
          } catch {}

          // SWR Cache Hydration: check if we have a cached authoritative role for this user
          let cachedRole: Role | null = null;
          try {
            const cached = localStorage.getItem(`auth_cache_${user.uid}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.uid === user.uid && isRole(parsed.role)) {
                cachedRole = parsed.role;
              }
            }
          } catch {}

          if (cachedRole) {
            setRole(cachedRole);
            setStatus("authenticated");
          } else {
            // Wait for authoritative profile from Firestore before switching to authenticated
            setStatus("loading");
          }
        }
      },
      (err) => {
        console.error("[auth] onAuthStateChanged error:", err);
        setError("Something went wrong with authentication.");
        setStatus("unauthenticated");
      },
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

    // Safety timeout: if the Firestore subscription hasn't resolved after an
    // extended wait, show an error state and cleanly sign out if the profile never existed.
    const timeoutId = setTimeout(() => {
      // If we are already authenticated from local cache and the browser is offline,
      // preserve offline access — do not drop the session.
      if (typeof navigator !== "undefined" && !navigator.onLine && role) {
        console.warn("[auth] Offline: Preserving cached role session.");
        return;
      }

      console.error(
        "[auth] Profile load timed out after 20s — entering error state.",
      );
      preservedErrorRef.current = true;
      setError(
        "Could not load your profile. Please check your connection or try signing in again.",
      );
      Promise.resolve(signOutUser()).catch(() => setStatus("unauthenticated"));
    }, 20000);

    if (import.meta.env.DEV) {
      console.log("[auth] Subscribing to UID:", uid);
    }
    const unsubscribe = userRepository.subscribeToDoc(
      uid,
      (data) => {
        if (import.meta.env.DEV) {
          console.log("[auth] Received profile data:", data);
        }
        if (data && data.isActive === false) {
          clearTimeout(timeoutId);
          preservedErrorRef.current = true;
          setError(
            "Your account has been deactivated. Please contact support.",
          );
          Promise.resolve(signOutUser()).catch(() =>
            setStatus("unauthenticated"),
          );
          return;
        }

        setProfile(data);

        if (data) {
          if (!isRole(data.role)) {
            clearTimeout(timeoutId);
            preservedErrorRef.current = true;
            setError(`Invalid or missing role on profile: ${data.role}`);
            Promise.resolve(signOutUser()).catch(() =>
              setStatus("unauthenticated"),
            );
            return;
          }

          clearTimeout(timeoutId);
          // Persist the authoritative role to cache for the next cold boot
          try {
            localStorage.setItem(
              `auth_cache_${uid}`,
              JSON.stringify({ uid, role: data.role }),
            );
          } catch {
            // Ignore localStorage quota/blocking errors
          }

          setRole((prev) => (prev !== data.role ? data.role : prev));
          setStatus((prev) =>
            prev !== "authenticated" ? "authenticated" : prev,
          );
        } else {
          // If data is null (profile not yet created), we wait — the timeout above
          // will handle the case where it never arrives.
          if (import.meta.env.DEV) {
            console.warn(
              "[auth] Profile document is null. Waiting for creation...",
            );
          }
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        console.error("[auth] Failed to subscribe to user profile:", err);
        setError("Could not load your profile.");
        setStatus("unauthenticated");
      },
    );
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [firebaseUser?.uid, role]);
  // 3. Signal that critical startup (Auth + Profile resolution) is complete
  useEffect(() => {
    if (status !== "loading") {
      // Give React and any lazy-loaded routes enough time to mount and
      // fetch their initial data before firing the telemetry initialization event.
      // 5 seconds guarantees the dashboard is fully populated.
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("app-ready"));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const value: AuthContextValue = {
    status,
    firebaseUser,
    profile,
    role,
    error,
    signOut: signOutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
