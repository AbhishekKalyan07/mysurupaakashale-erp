// IMPORTANT: env.ts MUST be the very first import so that all VITE_* keys
// from process.env are mapped into import.meta.env before Firebase initialises.
import './env';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/shared/lib/firebase';

export async function authenticateForAutomation() {
  const email = process.env.AUTOMATION_EMAIL;
  const password = process.env.AUTOMATION_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Automation credentials missing. Set AUTOMATION_EMAIL and ' +
      'AUTOMATION_PASSWORD in GitHub Actions secrets (see .env.example).'
    );
  }

  const userCred = await signInWithEmailAndPassword(auth, email, password);
  
  // Ensure the automation user has an admin role in Firestore so storage rules pass
  const userDocRef = doc(db, 'users', userCred.user.uid);
  const userDoc = await getDoc(userDocRef);
  
  if (!userDoc.exists() || userDoc.data()?.role !== 'admin') {
    await setDoc(userDocRef, {
      id: userCred.user.uid,
      email: userCred.user.email,
      role: 'admin',
      firstName: 'Automation',
      lastName: 'Service',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }, { merge: true });
    console.log('Upserted admin role for automation user in Firestore.');
  }

  console.log('Authenticated as automation admin.');
}
