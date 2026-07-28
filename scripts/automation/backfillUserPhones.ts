import './env';
import { authenticateForAutomation } from './auth';
import { getDocs, collection, setDoc, doc } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';

async function backfillUserPhones() {
  try {
    console.log('--- Starting userPhones Backfill ---');
    await authenticateForAutomation();

    console.log('Fetching all users...');
    const usersSnap = await getDocs(collection(db, 'users'));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log(`Found ${users.length} users. Migrating phones...`);

    let successCount = 0;
    let skipCount = 0;

    for (const user of users) {
      if (user.phone) {
        try {
          await setDoc(doc(db, 'userPhones', user.phone), { uid: user.id });
          successCount++;
        } catch (err) {
          console.error(`Failed to migrate phone for user ${user.id}:`, err);
        }
      } else {
        skipCount++;
      }
    }

    console.log(`Completed. Migrated: ${successCount}. Skipped (no phone): ${skipCount}.`);
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillUserPhones();
