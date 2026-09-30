// src/shared/lib/__tests__/environmentGuard.test.ts
/**
 * Unit tests for environmentGuard.node.ts
 *
 * Tests run in Node (Vitest) — no browser globals needed.
 * The guard calls process.exit(1) on failure; we spy on it to prevent
 * the test runner from actually exiting.
 *
 * Because the guard reads process.env at call time (not at import time),
 * we can use a single import and just patch the environment around each call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enforceEmulatorGuard } from '../environmentGuard.node';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

/** Apply a partial env patch, returning a restore function. */
function patchEnv(patch: Env): () => void {
  const original: Env = {};
  for (const key of Object.keys(patch)) {
    original[key] = process.env[key];
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }
  return () => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  };
}

// A fully safe emulator environment
const SAFE_ENV: Env = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  VITE_FIREBASE_PROJECT_ID: 'demo-test',
  FIREBASE_SERVICE_ACCOUNT_KEY: undefined,
  GOOGLE_APPLICATION_CREDENTIALS: undefined,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('enforceEmulatorGuard', () => {
  let restore: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on process.exit so the test runner doesn't actually quit.
    // Throw so we can assert it was called without execution continuing.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit(1) called by guard');
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    restore?.();
  });

  // ── A: passes in a fully correct emulator environment ───────────────────
  it('A: passes when all required emulator vars are set and project is demo-test', () => {
    restore = patchEnv(SAFE_ENV);
    expect(() => enforceEmulatorGuard()).not.toThrow();
  });

  // ── B: passes with 127.0.0.1 hosts ──────────────────────────────────────
  it('B: passes with 127.0.0.1 style emulator hosts', () => {
    restore = patchEnv({
      ...SAFE_ENV,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    });
    expect(() => enforceEmulatorGuard()).not.toThrow();
  });

  // ── C: blocks when FIRESTORE_EMULATOR_HOST is missing ───────────────────
  it('C: blocks when FIRESTORE_EMULATOR_HOST is missing', () => {
    restore = patchEnv({ ...SAFE_ENV, FIRESTORE_EMULATOR_HOST: undefined });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── D: blocks when FIREBASE_AUTH_EMULATOR_HOST is missing ────────────────
  it('D: blocks when FIREBASE_AUTH_EMULATOR_HOST is missing', () => {
    restore = patchEnv({ ...SAFE_ENV, FIREBASE_AUTH_EMULATOR_HOST: undefined });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── E: blocks when BOTH emulator hosts are missing ───────────────────────
  it('E: blocks when both emulator hosts are missing', () => {
    restore = patchEnv({
      ...SAFE_ENV,
      FIRESTORE_EMULATOR_HOST: undefined,
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
    });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── F: blocks when project ID is production (no demo/test substring) ─────
  it('F: blocks when project ID looks like production', () => {
    restore = patchEnv({
      ...SAFE_ENV,
      VITE_FIREBASE_PROJECT_ID: 'mysuru-paakashale-erp',
    });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── G: passes when project ID contains "test" ────────────────────────────
  it('G: passes when project ID contains "test"', () => {
    restore = patchEnv({ ...SAFE_ENV, VITE_FIREBASE_PROJECT_ID: 'mysuru-test' });
    expect(() => enforceEmulatorGuard()).not.toThrow();
  });

  // ── H: passes when project ID contains "demo" ────────────────────────────
  it('H: passes when project ID contains "demo"', () => {
    restore = patchEnv({ ...SAFE_ENV, VITE_FIREBASE_PROJECT_ID: 'demo-paakashale' });
    expect(() => enforceEmulatorGuard()).not.toThrow();
  });

  // ── I: blocks when FIREBASE_SERVICE_ACCOUNT_KEY is set ───────────────────
  it('I: blocks when production FIREBASE_SERVICE_ACCOUNT_KEY is present', () => {
    restore = patchEnv({
      ...SAFE_ENV,
      FIREBASE_SERVICE_ACCOUNT_KEY: '{"type":"service_account"}',
    });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── J: blocks when GOOGLE_APPLICATION_CREDENTIALS is set ─────────────────
  it('J: blocks when GOOGLE_APPLICATION_CREDENTIALS is present', () => {
    restore = patchEnv({
      ...SAFE_ENV,
      GOOGLE_APPLICATION_CREDENTIALS: '/path/to/serviceAccount.json',
    });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── K: VITE_USE_FIREBASE_EMULATORS=true alone is NOT sufficient ──────────
  it('K: VITE_USE_FIREBASE_EMULATORS=true alone does NOT bypass the host checks', () => {
    restore = patchEnv({
      VITE_USE_FIREBASE_EMULATORS: 'true',
      FIRESTORE_EMULATOR_HOST: undefined,
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
      VITE_FIREBASE_PROJECT_ID: 'demo-test',
      FIREBASE_SERVICE_ACCOUNT_KEY: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
    });
    expect(() => enforceEmulatorGuard()).toThrow('process.exit(1) called by guard');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
