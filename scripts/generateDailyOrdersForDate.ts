import './automation/env';
import { auth } from '../src/shared/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { orderService } from '../src/shared/services/business/orderService';

async function main() {
  const date = process.argv[2];
  if (!date) {
    console.error("Missing date argument");
    process.exit(1);
  }

  // Authenticate as Admin so Firestore operations are fully authorized
  const testPass = process.env.TEST_USER_PASSWORD || 'local-emulator-pass';
  await signInWithEmailAndPassword(auth, 'admin@test.com', testPass);
  console.log(`[generateDailyOrdersForDate] Authenticated as admin@test.com`);

  console.log(`[generateDailyOrdersForDate] Generating orders for ${date}...`);
  const result = await orderService.generateDailyOrders(date);
  console.log(`[generateDailyOrdersForDate] Result:`, JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error("[generateDailyOrdersForDate] Failed:", err);
  process.exit(1);
});
