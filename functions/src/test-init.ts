import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore as adminGetFirestore, type Firestore } from 'firebase-admin/firestore';

export function initTestApp(): App {
  if (getApps().length === 0) {
    return initializeApp({ projectId: 'demo-test' });
  }
  return getApps()[0];
}

export function getFirestore(): Firestore {
  initTestApp();
  return adminGetFirestore();
}

export async function cleanupTestApp() {
  // Safe cleanup for test suites
}

export { type Firestore };

