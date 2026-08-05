import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as path from 'path';
import * as dotenv from 'dotenv';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

if (!getApps().length) {
  initializeApp({ projectId: 'mysuru-paakashale-erp' });
}

const db = getFirestore();
const auth = getAuth();

async function check() {
  try {
    const user = await auth.getUserByEmail('admin@mysuru.com');
    console.log('Admin UID:', user.uid);
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      console.log('Doc exists!', doc.data());
    } else {
      console.log('Doc DOES NOT EXIST for uid:', user.uid);
    }
  } catch (e) {
    console.error('Error:', e);
  }
}
check();
