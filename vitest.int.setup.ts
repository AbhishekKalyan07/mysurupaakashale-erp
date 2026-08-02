import { afterEach, vi } from 'vitest';

// Unmock all firebase modules since we want to connect to the real emulators
vi.unmock('firebase/app');
vi.unmock('firebase/auth');
vi.unmock('firebase/firestore');
vi.unmock('firebase/storage');

process.env.VITE_USE_FIREBASE_EMULATORS = 'true';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-test';
process.env.VITE_FIREBASE_API_KEY = 'demo-key';

afterEach(async () => {
  try {
    // Clear firestore emulator between tests
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-test/databases/(default)/documents', {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Failed to clear emulator database:', error);
  }
});
