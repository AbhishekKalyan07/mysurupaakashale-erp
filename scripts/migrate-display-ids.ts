import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables (ensure FIREBASE_SERVICE_ACCOUNT_KEY path is set)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || path.resolve(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Service account file not found at ${serviceAccountPath}`);
  console.error(`Please download it from Firebase Console and place it at the root as service-account.json`);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrateDisplayIds() {
  console.log('Starting displayId migration...');
  
  const usersSnapshot = await db.collection('users').get();
  let count = 0;
  
  const prefixMap: Record<string, string> = {
    customer: 'CUST',
    admin: 'ADMIN',
    kitchen: 'KTCH',
    delivery_partner: 'DLVY',
    accounts: 'ACCT'
  };

  const countersRef = db.collection('settings').doc('userCounters');
  
  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data();
    
    // Skip if already has displayId (or has staffId we want to migrate)
    if (data.displayId) continue;
    
    // If they have a staffId, just rename it to displayId
    if (data.staffId) {
      console.log(`Migrating staffId to displayId for user ${userDoc.id}`);
      await userDoc.ref.update({
        displayId: data.staffId,
        staffId: require('firebase-admin/firestore').FieldValue.delete()
      });
      count++;
      continue;
    }
    
    const role = data.role || 'customer';
    const prefix = prefixMap[role] || 'USER';
    
    // Generate new ID via transaction to ensure safety even in a script
    const newDisplayId = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(countersRef);
      let currentVal = 1000;
      
      if (counterDoc.exists) {
        const counterData = counterDoc.data() || {};
        if (typeof counterData[role] === 'number') {
          currentVal = counterData[role];
        }
      } else {
        transaction.set(countersRef, { [role]: currentVal });
      }
      
      const newVal = currentVal + 1;
      transaction.set(countersRef, { [role]: newVal }, { merge: true });
      
      return `${prefix}-${newVal}`;
    });
    
    console.log(`Assigning ${newDisplayId} to user ${userDoc.id} (${data.fullName || 'Unknown'})`);
    await userDoc.ref.update({ displayId: newDisplayId });
    count++;
  }
  
  console.log(`Migration complete! Migrated ${count} users.`);
}

migrateDisplayIds().catch(console.error);
