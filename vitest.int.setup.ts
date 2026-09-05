import { afterEach, vi } from 'vitest';

// Unmock all firebase modules since we want to connect to the real emulators
vi.unmock('firebase/app');
vi.unmock('firebase/auth');
vi.unmock('firebase/firestore');
vi.unmock('firebase/storage');

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

process.env.VITE_USE_FIREBASE_EMULATORS = 'true';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-test';
process.env.VITE_FIREBASE_API_KEY = 'demo-key';

// Removed afterEach database clear because it wipes the database concurrently
// while other tests (like Cloud Functions) are still running.
// Individual test files should clear their own isolated databases (e.g., using env.clearFirestore())

