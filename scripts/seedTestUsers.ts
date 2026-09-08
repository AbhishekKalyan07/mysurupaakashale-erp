import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Ensure emulator env vars are set
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env.local') });

if (!getApps().length) {
  initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'mysuru-paakashale-erp' });
}

const auth = getAuth();
const db = getFirestore();

const testUsers = [
  { email: 'admin@mysuru.com', password: 'admin123', role: 'admin', fullName: 'Test Admin' },
  { email: 'customer@mysuru.com', password: 'customer123', role: 'customer', fullName: 'Test Customer' },
  { email: 'kitchen@mysuru.com', password: 'kitchen123', role: 'kitchen', fullName: 'Test Kitchen' },
  { email: 'delivery@mysuru.com', password: 'delivery123', role: 'delivery_partner', fullName: 'Test Delivery' },
];

async function seedTestUsers() {
  console.log('Seeding Test Users into Emulator...');

  for (const user of testUsers) {
    let uid = '';
    try {
      // Create in Firebase Auth
      const userRecord = await auth.createUser({
        email: user.email,
        password: user.password,
        displayName: user.fullName,
        emailVerified: true,
      });
      uid = userRecord.uid;
      console.log(`Created Auth user: ${user.email} (UID: ${uid})`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        const userRecord = await auth.getUserByEmail(user.email);
        uid = userRecord.uid;
        
        // Ensure the password is correct for dev login
        await auth.updateUser(uid, { password: user.password });
        
        console.log(`User ${user.email} already exists (UID: ${uid}). Updated password to default.`);
      } else {
        console.error(`Error creating ${user.email}:`, error);
        continue;
      }
    }

    try {
      // Create in Firestore
      const profileData: any = {
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        isActive: true,
        passwordCreated: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      if (user.role === 'customer') {
        profileData.phone = '9876543210';
        profileData.displayId = 'MP-T001';
        profileData.addresses = [
          {
            id: 'addr-1',
            label: 'Home',
            line1: '123 Test Street',
            city: 'Mysuru',
            state: 'KA',
            pincode: '570001',
            lat: null,
            lng: null,
            isDefault: true,
          }
        ];
        profileData.defaultAddressId = 'addr-1';
        profileData.deliveryPartnerId = null;
        profileData.zoneId = null;
      }

      if (user.role === 'delivery_partner') {
        profileData.phone = '9998887776';
        profileData.displayId = 'DP-T001';
        profileData.zoneIds = [];
        profileData.vehicleType = 'bike';
        profileData.isAvailable = true;
      }

      await db.collection('users').doc(uid).set(profileData);
      
      console.log(`Created/Updated Firestore profile for: ${user.email}`);
    } catch (error: any) {
      console.error(`Error creating Firestore profile for ${user.email}:`, error);
    }
  }

  console.log('Done seeding test users!');
  process.exit(0);
}

seedTestUsers();
