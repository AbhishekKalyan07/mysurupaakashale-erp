import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// IMPORTANT: Set up Firebase Admin SDK with a service account
// You will need a serviceAccountKey.json file in the root of your project
try {
  const serviceAccount = require('../serviceAccountKey.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (error) {
  console.error('Failed to initialize Firebase Admin. Please ensure you have a valid serviceAccountKey.json file in the root directory.');
  console.error(error);
  process.exit(1);
}

const db = getFirestore();

async function generateNextDisplayId(fullName?: string): Promise<string> {
  const counterRef = db.collection('settings').doc('userCounters');
  
  if (fullName) {
    const firstLetter = fullName.trim().charAt(0).toUpperCase();
    const validLetter = /^[A-Z]$/.test(firstLetter) ? firstLetter : 'U';
    const fieldName = `customer_${validLetter}`;

    return db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let count = 0;

      if (counterDoc.exists) {
        const data = counterDoc.data();
        if (data && typeof data[fieldName] === 'number') {
          count = data[fieldName];
        }
      } else {
        transaction.set(counterRef, { [fieldName]: count });
      }

      const newCount = count + 1;
      transaction.set(counterRef, { [fieldName]: newCount }, { merge: true });

      const paddedCount = newCount.toString().padStart(3, '0');
      return `MP-${validLetter}${paddedCount}`;
    });
  }
  
  return 'MP-U000'; // Fallback
}

async function migrateCustomers() {
  console.log('Starting Customer Migration...');
  
  try {
    const customersSnap = await db.collection('users').where('role', '==', 'customer').get();
    console.log(`Found ${customersSnap.size} customers to migrate.`);
    
    let migratedCount = 0;

    for (const doc of customersSnap.docs) {
      const data = doc.data();
      const currentDisplayId = data.displayId;
      const fullName = data.fullName;
      
      // Generate new Display ID
      const newDisplayId = await generateNextDisplayId(fullName);
      
      const updateData: any = {
        displayId: newDisplayId
      };
      
      // Initialize delivery partner fields if missing
      if (!data.hasOwnProperty('deliveryPartnerId')) {
        updateData.deliveryPartnerId = null;
      }
      
      // 1. Update Customer Record
      await doc.ref.update(updateData);
      
      // 2. Update all existing orders for this customer to use the new displayId
      const ordersSnap = await db.collection('orders').where('customerId', '==', doc.id).get();
      if (!ordersSnap.empty) {
        const batch = db.batch();
        ordersSnap.docs.forEach(orderDoc => {
          batch.update(orderDoc.ref, { displayId: newDisplayId });
        });
        await batch.commit();
        console.log(`Updated ${ordersSnap.size} orders for customer ${fullName} (${newDisplayId})`);
      }
      
      console.log(`Migrated Customer: ${fullName} | ${currentDisplayId} -> ${newDisplayId}`);
      migratedCount++;
    }
    
    console.log(`\nMigration completed successfully. Migrated ${migratedCount} customers.`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateCustomers().then(() => process.exit(0)).catch(() => process.exit(1));
