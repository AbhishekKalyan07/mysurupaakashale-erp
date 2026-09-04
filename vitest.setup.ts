import { vi, beforeEach, afterEach } from 'vitest';

// Expose vi to the global scope for any remaining jest mocks or general use.
(globalThis as any).jest = vi;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Global window mocks for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Global mock for Firebase to ensure tests never connect to production
vi.mock('firebase/storage', () => ({
  connectStorageEmulator: vi.fn(),
  getStorage: vi.fn(() => ({})),
}));

vi.mock('firebase/app', () => {
  class FirebaseError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    initializeApp: vi.fn(),
    getApp: vi.fn(),
    getApps: vi.fn(() => []),
    FirebaseError,
  };
});

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: {},
  connectAuthEmulator: vi.fn(),
  getAuth: vi.fn(() => ({
    currentUser: { uid: 'test-user', email: 'test@example.com' },
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  })),
  setPersistence: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  connectFirestoreEmulator: vi.fn(),
  getFirestore: vi.fn(),
  initializeFirestore: vi.fn(() => ({})),
  memoryLocalCache: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(),
  persistentSingleTabManager: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(),
  collection: vi.fn(() => ({
    withConverter: vi.fn((converter) => ({ converter, type: 'collection' })),
  })),
  doc: vi.fn(() => ({ id: 'mock-doc-id', type: 'doc' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  increment: vi.fn((n) => n),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
  runTransaction: vi.fn(async (db, updateFunction) => {
    const transaction = {
      get: vi.fn(async (_docRef) => ({
        exists: () => false,
        data: () => ({}),
      })),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    return await updateFunction(transaction);
  }),
  setLogLevel: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })),
  Timestamp: class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() { return new Date(this.seconds * 1000); }
    toMillis() { return this.seconds * 1000; }
    isEqual(other: any) { return other.seconds === this.seconds; }
    valueOf() { return this.toMillis().toString(); }
    static now() { return new Timestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(date: Date) { return new Timestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(millis: number) { return new Timestamp(Math.floor(millis / 1000), 0); }
  },
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: {} })))
}));
