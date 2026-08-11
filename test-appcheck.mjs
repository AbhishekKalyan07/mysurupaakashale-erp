import { initializeApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';

globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = "12345678-1234-1234-1234-123456789012";

const app = initializeApp({
  projectId: "demo-test",
  appId: "1:1234567890:web:1234567890abcdef",
  apiKey: "fake-api-key"
});

const appCheck = initializeAppCheck(app, {
  provider: new CustomProvider({
    getToken: () => Promise.resolve({ token: 'debug', expireTimeMillis: Date.now() + 3600000 })
  })
});

import { getToken } from 'firebase/app-check';

getToken(appCheck).then(res => {
  console.log("Generated token:", res.token);
  process.exit(0);
}).catch(err => {
  console.error("Error generating token:", err);
  process.exit(1);
});
