/**
 * Storage Security Rules — Penetration Test Suite
 *
 * Tests firebase storage.rules using @firebase/rules-unit-testing.
 * Covers: owner isolation, cross-user IDOR, role access, MIME type enforcement,
 * file size limits, and path-based access control.
 *
 * Run with:
 *   npx firebase emulators:start --only firestore,storage --project demo-security-test
 *   npx vitest run --config vitest.int.config.ts tests/security/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getDownloadURL, connectStorageEmulator } from '@firebase/storage';
import { doc, setDoc } from '@firebase/firestore';

const PROJECT_ID = 'mysuru-paakashale-erp';

const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

// Helper to create a fake file buffer and metadata
function makeFile(mimeType: string, sizeBytes: number): { data: Uint8Array, meta: { contentType: string } } {
  return {
    data: new Uint8Array(sizeBytes).fill(0),
    meta: { contentType: mimeType }
  };
}

// Helper to get connected storage
function getStorage(uid?: string) {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  const storage = ctx.storage();
   // Fail fast instead of hanging
  return storage;
}

// Helper to get admin storage
function getAdminStorage() {
  const ctx = env.unauthenticatedContext();
  const storage = ctx.storage(); // In rules-unit-testing v2, admin storage is handled differently, but we can use withSecurityRulesDisabled
  
  return storage;
}

withEmulator('🔐 Storage Security Rules — Penetration Suite', () => {
  let env: RulesTestEnvironment;

  // Helper to get connected storage
  function getStorage(uid?: string) {
    const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
    return ctx.storage();
  }

  // Helper to get admin storage
  function getAdminStorage() {
    const ctx = env.unauthenticatedContext();
    return ctx.storage();
  }

  const ADMIN_UID = 'uid-admin';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const CUSTOMER_B_UID = 'uid-customer-b';
  const KITCHEN_UID = 'uid-kitchen';
  const DELIVERY_UID = 'uid-delivery';
  const DELIVERY_B_UID = 'uid-delivery-b';
  const ACCOUNTS_UID = 'uid-accounts';
  const DELIVERY_ID = 'delivery-1';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(
          path.resolve(__dirname, '../../firestore.rules'),
          'utf8',
        ),
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: fs.readFileSync(
          path.resolve(__dirname, '../../storage.rules'),
          'utf8',
        ),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ADMIN_UID),       { id: ADMIN_UID,      role: 'admin' }),
        setDoc(doc(db, 'users', CUSTOMER_A_UID),  { id: CUSTOMER_A_UID, role: 'customer' }),
        setDoc(doc(db, 'users', CUSTOMER_B_UID),  { id: CUSTOMER_B_UID, role: 'customer' }),
        setDoc(doc(db, 'users', KITCHEN_UID),     { id: KITCHEN_UID,    role: 'kitchen' }),
        setDoc(doc(db, 'users', DELIVERY_UID),    { id: DELIVERY_UID,   role: 'delivery_partner' }),
        setDoc(doc(db, 'users', DELIVERY_B_UID),  { id: DELIVERY_B_UID, role: 'delivery_partner' }),
        setDoc(doc(db, 'users', ACCOUNTS_UID),    { id: ACCOUNTS_UID,   role: 'accounts' }),
        // Delivery document used for delivery-proof access checks
        setDoc(doc(db, 'deliveries', DELIVERY_ID), {
          customerId: CUSTOMER_A_UID,
          deliveryPartnerId: DELIVERY_UID,
          orderId: 'order-1',
        }),
      ]);
    });
  });

  afterAll(async () => env.cleanup());

  // =========================================================================
  // 1. Profile Photos — Owner Isolation
  // =========================================================================
  describe('1. Profile Photos', () => {
    const validImage = makeFile('image/jpeg', 100 * 1024); // 100 KB

    it('ALLOW: Owner can upload their own profile photo', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
      await assertSucceeds(photoRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Customer A cannot upload to Customer B profile path', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_B_UID}/photo.jpg`);
      await assertFails(photoRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Unauthenticated cannot upload profile photo', async () => {
      const storage = getStorage();
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
      await assertFails(photoRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Customer cannot upload oversized profile photo (>5MB)', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const bigImage = makeFile('image/jpeg', 6 * 1024 * 1024); // 6 MB
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/big.jpg`);
      await assertFails(photoRef.put(bigImage.data, bigImage.meta));
    });

    it('DENY: Customer cannot upload non-image file as profile photo', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const pdfFile = makeFile('application/pdf', 100 * 1024);
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/resume.pdf`);
      await assertFails(photoRef.put(pdfFile.data, pdfFile.meta));
    });

    it('DENY: Customer B cannot read Customer A profile photo (IDOR)', async () => {
      // First seed a photo via admin
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
        await photoRef.put(validImage.data, validImage.meta);
      });

      const storage = getStorage(CUSTOMER_B_UID);
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
      await assertFails(photoRef.getDownloadURL());
    });

    it('ALLOW: Admin can read any profile photo', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
        await photoRef.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(ADMIN_UID);
      const photoRef = storage.ref(`profile-photos/${CUSTOMER_A_UID}/photo.jpg`);
      await assertSucceeds(photoRef.getDownloadURL());
    });
  });

  // =========================================================================
  // 2. Delivery Proof Photos — Driver Isolation
  // =========================================================================
  describe('2. Delivery Proof Photos', () => {
    const validImage = makeFile('image/jpeg', 500 * 1024); // 500 KB

    it('ALLOW: Assigned delivery partner can upload proof', async () => {
      const storage = getStorage(DELIVERY_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertSucceeds(proofRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Unassigned delivery partner cannot upload proof', async () => {
      const storage = getStorage(DELIVERY_B_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertFails(proofRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Customer cannot upload delivery proof', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertFails(proofRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Kitchen cannot upload delivery proof', async () => {
      const storage = getStorage(KITCHEN_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertFails(proofRef.put(validImage.data, validImage.meta));
    });

    it('DENY: Accounts cannot read delivery proof (not in scope)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
        await proofRef.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(ACCOUNTS_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertFails(proofRef.getDownloadURL());
    });

    it('ALLOW: Customer can read their own delivery proof', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
        await proofRef.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(CUSTOMER_A_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertSucceeds(proofRef.getDownloadURL());
    });

    it('DENY: Customer B cannot read Customer A delivery proof (IDOR)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
        await proofRef.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(CUSTOMER_B_UID);
      const proofRef = storage.ref(`delivery-proof/${DELIVERY_ID}/proof.jpg`);
      await assertFails(proofRef.getDownloadURL());
    });
  });

  // =========================================================================
  // 3. Payment Screenshots — Owner + Accounts + Admin
  // =========================================================================
  describe('3. Payment Screenshots', () => {
    const validImage = makeFile('image/png', 200 * 1024);

    it('ALLOW: Customer can upload their own payment screenshot', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
      await assertSucceeds(ref_.put(validImage.data, validImage.meta));
    });

    it('DENY: Customer A cannot upload to Customer B payment path', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_B_UID}/receipt.png`);
      await assertFails(ref_.put(validImage.data, validImage.meta));
    });

    it('DENY: Kitchen cannot read payment screenshots', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
        await ref_.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(KITCHEN_UID);
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
      await assertFails(ref_.getDownloadURL());
    });

    it('ALLOW: Accounts can read payment screenshots', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
        await ref_.put(validImage.data, validImage.meta);
      });
      const storage = getStorage(ACCOUNTS_UID);
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
      await assertSucceeds(ref_.getDownloadURL());
    });

    it('DENY: Customer cannot upload executable file masquerading as image', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const exeFile = makeFile('application/octet-stream', 100 * 1024);
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/malware.exe`);
      await assertFails(ref_.put(exeFile.data, exeFile.meta));
    });

    it('DENY: Unauthenticated cannot access payment screenshots', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
        await ref_.put(validImage.data, validImage.meta);
      });
      const storage = getStorage();
      const ref_ = storage.ref(`payment-screenshots/${CUSTOMER_A_UID}/receipt.png`);
      await assertFails(ref_.getDownloadURL());
    });
  });

  // =========================================================================
  // 4. Backups & Reports — Admin only
  // =========================================================================
  describe('4. Backups and Reports', () => {
    it('DENY: Customer cannot read backups', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const ref_ = storage.ref('backups/db_export.json');
      await assertFails(ref_.getDownloadURL());
    });

    it('DENY: Kitchen cannot access backups', async () => {
      const storage = getStorage(KITCHEN_UID);
      const ref_ = storage.ref('backups/db_export.json');
      await assertFails(ref_.getDownloadURL());
    });

    it('ALLOW: Admin can read reports', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const ref_ = storage.ref('reports/monthly.xlsx');
        const mockFile = makeFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10 * 1024);
        await ref_.put(mockFile.data, mockFile.meta);
      });
      const storage = getStorage(ADMIN_UID);
      const ref_ = storage.ref('reports/monthly.xlsx');
      await assertSucceeds(ref_.getDownloadURL());
    });

    it('ALLOW: Accounts can read reports', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storage = ctx.storage();
        
        const ref_ = storage.ref('reports/monthly.xlsx');
        const mockFile = makeFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10 * 1024);
        await ref_.put(mockFile.data, mockFile.meta);
      });
      const storage = getStorage(ACCOUNTS_UID);
      const ref_ = storage.ref('reports/monthly.xlsx');
      await assertSucceeds(ref_.getDownloadURL());
    });

    it('DENY: Delivery partner cannot access reports', async () => {
      const storage = getStorage(DELIVERY_UID);
      const ref_ = storage.ref('reports/monthly.xlsx');
      await assertFails(ref_.getDownloadURL());
    });
  });

  // =========================================================================
  // 5. Path Traversal — Attempt to access unmatched paths
  // =========================================================================
  describe('5. Path Traversal and Unmatched Paths', () => {
    it('DENY: Any user cannot access arbitrary unlisted storage paths', async () => {
      const storage = getStorage(ADMIN_UID);
      const ref_ = storage.ref('internal/secrets/config.json');
      await assertFails(ref_.getDownloadURL());
    });

    it('DENY: Customer cannot upload to root path', async () => {
      const storage = getStorage(CUSTOMER_A_UID);
      const rootRef = storage.ref('rootfile.jpg');
      const rootFile = makeFile('image/jpeg', 100);
      await assertFails(rootRef.put(rootFile.data, rootFile.meta));
    });
  });
});
