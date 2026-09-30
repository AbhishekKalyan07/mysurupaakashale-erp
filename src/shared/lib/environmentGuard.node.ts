// src/shared/lib/environmentGuard.node.ts
/**
 * Node-only environment guard for seed / test / wipe scripts.
 *
 * Call enforceEmulatorGuard() as the FIRST statement of every script that
 * can write or delete Firebase data.  The guard aborts the process (exit 1)
 * unless ALL of the following conditions are satisfied:
 *
 *   1. FIRESTORE_EMULATOR_HOST   is set  (e.g. 127.0.0.1:8080)
 *   2. FIREBASE_AUTH_EMULATOR_HOST is set (e.g. 127.0.0.1:9099)
 *   3. The target project ID contains "demo" or "test"
 *   4. No production service-account credentials are present in the environment
 *
 * This file must NEVER be imported by browser / Vite code.
 */

export function enforceEmulatorGuard(): void {
  const firestoreEmu = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

  const errors: string[] = [];

  // Both emulator host vars must be present
  if (!firestoreEmu) {
    errors.push(
      'FIRESTORE_EMULATOR_HOST is not set (expected e.g. 127.0.0.1:8080)'
    );
  }
  if (!authEmu) {
    errors.push(
      'FIREBASE_AUTH_EMULATOR_HOST is not set (expected e.g. 127.0.0.1:9099)'
    );
  }

  // Reject obviously-production project IDs
  if (projectId && !projectId.includes('demo') && !projectId.includes('test')) {
    errors.push(
      `Project ID "${projectId}" does not contain "demo" or "test" — refusing to target a production project`
    );
  }

  // Reject production service-account credentials in the environment
  if (
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    errors.push(
      'Production credentials detected (FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS). ' +
        'Remove them before running seed/test scripts.'
    );
  }

  if (errors.length > 0) {
    console.error(
      '\n🚫  BLOCKED: This script cannot run outside the Firebase Emulator.\n'
    );
    errors.forEach((e) => console.error(`   ✗  ${e}`));
    console.error(
      '\n   Start emulators:  npm run emulators:start\n' +
        '   Then export the required env vars and re-run the script.\n'
    );
    process.exit(1);
  }

  console.log(
    `✅  Emulator guard passed — targeting project "${projectId ?? '(unset)'}" ` +
      `via Firestore@${firestoreEmu} Auth@${authEmu}`
  );
}
