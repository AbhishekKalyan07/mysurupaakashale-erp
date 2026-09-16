// IMPORTANT: env.ts MUST be the very first import so that all VITE_* keys
// from process.env are mapped into import.meta.env before Firebase initialises.
import './env';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export async function authenticateForAutomation() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    throw new Error(
      'Automation credentials missing. Set FIREBASE_SERVICE_ACCOUNT in GitHub Actions secrets or .env.local (see .env.example).'
    );
  }

  // Parse the service account credentials
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }

  // Initialize firebase-admin if not already initialized
  if (!getApps()?.length) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  // We use a deterministic UID for automation so we can grant it the admin role once
  const uid = 'automation-service-account';

  // Generate a custom token
  const customToken = await getAuth().createCustomToken(uid);

  // Authenticate the client SDK with the custom token
  const userCred = await signInWithCustomToken(auth, customToken);
  
  // Ensure the automation user has an admin role in Firestore so storage rules pass.
  // We use the admin SDK here to bypass any security rules that would block a
  // newly created (non-admin) user from granting themselves the admin role.
  const adminDb = getFirestore();
  const userDocRef = adminDb.collection('users').doc(userCred.user.uid);
  const userDoc = await userDocRef.get();
  
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    await userDocRef.set({
      id: userCred.user.uid,
      email: serviceAccount.client_email || 'automation@service.account',
      role: 'admin',
      firstName: 'Automation',
      lastName: 'Service',
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Upserted admin role for automation user in Firestore.');
  }

  console.log('Authenticated as automation admin.');
}
