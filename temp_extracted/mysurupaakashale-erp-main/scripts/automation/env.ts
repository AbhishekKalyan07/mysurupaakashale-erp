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

// import.meta.env is a plain object in vite-node — we can safely
// assign new properties onto it.
const metaEnv = import.meta.env as Record<string, string | undefined>;

for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('VITE_') && value !== undefined) {
    metaEnv[key] = value;
  }
}
