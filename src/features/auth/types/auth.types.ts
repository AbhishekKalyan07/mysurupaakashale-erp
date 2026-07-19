import type { User as FirebaseUser } from 'firebase/auth';
import type { Role } from '@/shared/constants/roles';
import type { UserProfile } from '@/shared/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  /** Raw Firebase Auth user — prefer `profile` for display data; this is mainly for uid/email/getIdToken(). */
  firebaseUser: FirebaseUser | null;
  /** Firestore `users/{uid}` document, kept live via onSnapshot. */
  profile: UserProfile | null;
  /** Convenience accessor for `profile?.role` / the ID token's custom claim. */
  role: Role | null;
  error: string | null;
  signOut: () => Promise<void>;
}

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface SignupFormValues {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}
