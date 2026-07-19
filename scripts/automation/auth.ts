import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';

export async function authenticateForAutomation() {
  const email = process.env.VITE_AUTOMATION_EMAIL || import.meta.env.VITE_AUTOMATION_EMAIL;
  const password = process.env.VITE_AUTOMATION_PASSWORD || import.meta.env.VITE_AUTOMATION_PASSWORD;

  if (!email || !password) {
    throw new Error('Automation credentials missing. Please set VITE_AUTOMATION_EMAIL and VITE_AUTOMATION_PASSWORD.');
  }

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated as automation admin.');
}
