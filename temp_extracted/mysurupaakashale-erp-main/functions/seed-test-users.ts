import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function createTestUser(role: string) {
  const email = `test-${role}@mysurupaakashale.in`;
  const password = `Password123!`;
  let userRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    console.log(`User ${email} already exists. Updating password...`);
    await admin.auth().updateUser(userRecord.uid, { password });
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`Creating user ${email}...`);
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      });
    } else {
      throw error;
    }
  }

  // Update custom claims (if any) and Firestore document
  await admin.auth().setCustomUserClaims(userRecord.uid, { role });
  
  await db.collection('users').doc(userRecord.uid).set({
    id: userRecord.uid,
    email,
    fullName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    phone: '9999999999',
    role,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✅ Test ${role} ready: ${email}`);
}

async function run() {
  await createTestUser('admin');
  await createTestUser('kitchen');
  await createTestUser('delivery_partner');
  console.log('All test users seeded successfully.');
  process.exit(0);
}

run().catch(console.error);
