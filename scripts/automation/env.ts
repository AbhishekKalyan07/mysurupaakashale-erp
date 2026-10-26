/**
 * env.ts — Node / CI environment bootstrap shim.
 *
 * GitHub Actions injects secrets as process.env.* variables.
 * But firebase.ts and every other module in this repo reads
 * import.meta.env.* (Vite's build-time replacement).
 *
 * When vite-node runs a script in a Node process, import.meta.env
 * is NOT automatically populated from process.env — so every
 * import.meta.env.VITE_* read returns `undefined`, Firebase
 * initialises with an empty config, and the run fails immediately.
 *
 * FIX: import this file FIRST in every automation entry-point
 * (daily.ts, weekly.ts, monthly.ts). It copies all VITE_* keys
 * from process.env into import.meta.env so that every subsequent
 * import sees the correct values.
 *
 * This shim is ONLY used by Node scripts — never imported by the
 * browser app (Vite replaces import.meta.env at build time there).
 */

export function bootstrapAutomationEnv(
  sourceEnv: Record<string, string | undefined> = process.env,
  metaEnv: Record<string, string | undefined> = (import.meta as any).env ?? {}
): void {
  // 1. Copy all VITE_* keys from process.env into import.meta.env
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (key.startsWith('VITE_') && value !== undefined) {
      metaEnv[key] = value;
    }
  }

  // 2. Ensure keys in metaEnv are reflected in process.env so Node SDKs can see them
  for (const [key, value] of Object.entries(metaEnv)) {
    if (key.startsWith('VITE_') && value !== undefined && sourceEnv[key] === undefined) {
      sourceEnv[key] = value;
    }
  }

  // 3. Determine if running in emulator or test mode
  const isEmulatorOrTest =
    sourceEnv.VITE_USE_FIREBASE_EMULATORS === 'true' ||
    sourceEnv.NODE_ENV === 'test' ||
    metaEnv.MODE === 'test';

  // 4. Handle dedicated automation API key
  const automationApiKey = sourceEnv.FIREBASE_AUTOMATION_API_KEY?.trim();

  if (automationApiKey) {
    metaEnv.VITE_FIREBASE_API_KEY = automationApiKey;
    sourceEnv.VITE_FIREBASE_API_KEY = automationApiKey;
  } else if (!isEmulatorOrTest) {
    // Non-emulator production automation: fail fast immediately.
    // Never silently fall back to VITE_FIREBASE_API_KEY because the browser key
    // has HTTP website referrer restrictions that reject Node.js requests (<empty> referer).
    throw new Error(
      '[Automation Bootstrap] Missing required secret: FIREBASE_AUTOMATION_API_KEY. ' +
      'Production Node.js automation requires a dedicated, non-website-restricted API key. ' +
      'Falling back to VITE_FIREBASE_API_KEY is blocked because the browser key is restricted to HTTP website referrers.'
    );
  }

  // 5. App Check debug token
  if (sourceEnv.APPCHECK_DEBUG_TOKEN) {
    (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = sourceEnv.APPCHECK_DEBUG_TOKEN;
  }
}

// Execute bootstrap immediately upon import in Node.js runtime
bootstrapAutomationEnv();
