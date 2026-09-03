const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');
const { connectAuthEmulator } = require('firebase/auth');

const firebaseConfig = {
  projectId: "demo-test",
  apiKey: "fake-api-key"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const testFunctions = async () => {
  const manualGenerateDailyOrders = httpsCallable(functions, 'manualGenerateDailyOrders');
  const manualProcessDailyBilling = httpsCallable(functions, 'manualProcessDailyBilling');

  console.log("=== Testing manualGenerateDailyOrders ===");

  // 1. Unauthenticated
  try {
    await manualGenerateDailyOrders({ date: '2026-10-15' });
    console.error("❌ Unauthenticated call succeeded (should have failed)");
  } catch (e) {
    console.log(`✅ Unauthenticated call failed: ${e.message}`);
  }

  // 2. Authenticated Non-Admin
  try {
    await signInWithEmailAndPassword(auth, 'customer@example.com', 'password');
    await manualGenerateDailyOrders({ date: '2026-10-15' });
    console.error("❌ Non-Admin call succeeded (should have failed)");
  } catch (e) {
    console.log(`✅ Non-Admin call failed: ${e.message}`);
  }

  // 3. Authenticated Admin
  try {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, 'admin@example.com', 'password');
    const res1 = await manualGenerateDailyOrders({ date: '2026-10-15' });
    console.log(`✅ Admin call succeeded:`, res1.data);
  } catch (e) {
    console.error(`❌ Admin call failed: ${e.message}`, e);
  }

  console.log("=== Testing manualProcessDailyBilling ===");

  // 1. Unauthenticated
  try {
    await signOut(auth);
    await manualProcessDailyBilling({ date: '2026-10-15' });
    console.error("❌ Unauthenticated call succeeded (should have failed)");
  } catch (e) {
    console.log(`✅ Unauthenticated call failed: ${e.message}`);
  }

  // 2. Authenticated Non-Admin
  try {
    await signInWithEmailAndPassword(auth, 'customer@example.com', 'password');
    await manualProcessDailyBilling({ date: '2026-10-15' });
    console.error("❌ Non-Admin call succeeded (should have failed)");
  } catch (e) {
    console.log(`✅ Non-Admin call failed: ${e.message}`);
  }

  // 3. Authenticated Admin
  try {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, 'admin@example.com', 'password');
    const res2 = await manualProcessDailyBilling({ date: '2026-10-15' });
    console.log(`✅ Admin call succeeded:`, res2.data);
  } catch (e) {
    console.error(`❌ Admin call failed: ${e.message}`, e);
  }

  process.exit(0);
};

testFunctions().catch(console.error);
