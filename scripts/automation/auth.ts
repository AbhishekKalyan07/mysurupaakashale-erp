// IMPORTANT: env.ts MUST be the very first import so that all VITE_* keys
// from process.env are mapped into import.meta.env before Firebase initialises.
import './env';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';

export async function authenticateForAutomation() {
  // Since vite-node natively loads .env.local into import.meta.env,
  // we should check both import.meta.env and process.env.
  const email = (import.meta.env.VITE_AUTOMATION_EMAIL as string | undefined) || process.env.VITE_AUTOMATION_EMAIL;
  const password = (import.meta.env.VITE_AUTOMATION_PASSWORD as string | undefined) || process.env.VITE_AUTOMATION_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Automation credentials missing. Set VITE_AUTOMATION_EMAIL and ' +
      'VITE_AUTOMATION_PASSWORD in GitHub Actions secrets (see .env.example).'
    );
  }

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated as automation admin.');
}
