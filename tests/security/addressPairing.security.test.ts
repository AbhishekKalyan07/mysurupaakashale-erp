import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from '@firebase/firestore';

const PROJECT_ID = 'demo-addr-pairing';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Direct SDK Address Pairing & Integrity Security Rules', () => {
  let env: RulesTestEnvironment;
  const CUSTOMER_A_UID = 'uid-cust-addr-a';
  const CUSTOMER_B_UID = 'uid-cust-addr-b';
  const ADMIN_UID = 'uid-admin-addr';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  beforeEach(async (ctx) => {
    if (!env) {
      ctx.skip();
      return;
    }
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
        id: CUSTOMER_A_UID,
        role: 'customer',
        isActive: true,
        fullName: 'Customer A',
        addresses: [
          {
            id: 'addr-existing-1',
            label: 'Home',
            line1: '123 Main St',
            city: 'Mysuru',
            state: 'KA',
            pincode: '570001',
            isDefault: true,
            lat: null,
            lng: null,
          },
        ],
        addressIds: ['addr-existing-1'],
        defaultAddressId: 'addr-existing-1',
      });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'), {
        id: 'addr-existing-1',
        label: 'Home',
        line1: '123 Main St',
        city: 'Mysuru',
        state: 'KA',
        pincode: '570001',
        isDefault: true,
        lat: null,
        lng: null,
      });

      await setDoc(doc(db, 'users', CUSTOMER_B_UID), {
        id: CUSTOMER_B_UID,
        role: 'customer',
        isActive: true,
        fullName: 'Customer B',
        addresses: [
          {
            id: 'addr-cust-b',
            label: 'Office',
            line1: '456 Tech Park',
            city: 'Mysuru',
            state: 'KA',
            pincode: '570002',
            isDefault: true,
            lat: null,
            lng: null,
          },
        ],
        addressIds: ['addr-cust-b'],
        defaultAddressId: 'addr-cust-b',
      });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID, 'addresses', 'addr-cust-b'), {
        id: 'addr-cust-b',
        label: 'Office',
        line1: '456 Tech Park',
        city: 'Mysuru',
        state: 'KA',
        pincode: '570002',
        isDefault: true,
        lat: null,
        lng: null,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Independent Unpaired Modifications (Adversarial Scenarios 1–5)
  // ─────────────────────────────────────────────────────────────────────────────

  it('DENY (Scenario 1): Customer cannot independently add an ID to root addressIds without creating mirror document', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial single write: Appending 'addr-unpaired' to root addressIds alone
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-existing-1', 'addr-unpaired'],
      })
    );
  });

  it('DENY (Scenario 2): Customer cannot independently create a mirrored address without including its ID in root addressIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial single write: Creating subcollection mirror alone
    await assertFails(
      setDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-orphan-mirror'), {
        id: 'addr-orphan-mirror',
        label: 'Secret Place',
        line1: '999 Secret St',
        city: 'Mysuru',
        state: 'KA',
        isDefault: false,
        lat: null,
        lng: null,
      })
    );
  });

  it('DENY (Scenario 3): Customer cannot independently remove an ID from root addressIds without deleting the mirror document', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial single write: Dropping 'addr-existing-1' from root index while subcollection doc still exists
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addressIds: [],
      })
    );
  });

  it('DENY (Scenario 4): Customer cannot independently delete the mirrored address without removing the ID from root addressIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial single write: Deleting subcollection mirror alone while root addressIds still has it
    await assertFails(
      deleteDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'))
    );
  });

  it('DENY (Scenario 5a): Customer cannot update mirror document with mismatched ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial write: Tampering address ID inside the document
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'), {
        id: 'addr-tampered-id',
        line1: 'Tampered St',
      })
    );
  });

  it('DENY (Scenario 5b): Customer cannot update mirror document if its ID is not in root addressIds', async (ctx) => {
    if (!env) return ctx.skip();
    // Pre-seed an unindexed address using security rules bypass
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-unindexed-doc'), {
        id: 'addr-unindexed-doc',
        label: 'Unindexed',
        line1: 'Old St',
        city: 'Mysuru',
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // Attempting to update unindexed mirror must fail
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-unindexed-doc'), {
        id: 'addr-unindexed-doc',
        line1: 'Updated St',
      })
    );
  });

  it('DENY: Adding 2 IDs but creating only the last mirror is rejected', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    const validRef = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-valid');

    batch.update(userRef, {
      addressIds: ['addr-existing-1', 'addr-ghost', 'addr-valid'],
      updatedAt: new Date(),
    });
    // Only create addr-valid mirror, omitting addr-ghost mirror
    batch.set(validRef, {
      id: 'addr-valid',
      label: 'Valid',
      line1: 'Valid St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    });

    await assertFails(batch.commit());
  });

  it('ALLOW: Adding 2 IDs and creating both mirrors in the same atomic batch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    const mirror1Ref = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-pair-1');
    const mirror2Ref = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-pair-2');

    const addr1 = {
      id: 'addr-pair-1',
      label: 'Pair 1',
      line1: 'Pair 1 St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    };
    const addr2 = {
      id: 'addr-pair-2',
      label: 'Pair 2',
      line1: 'Pair 2 St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570002',
      isDefault: false,
      lat: null,
      lng: null,
    };

    batch.update(userRef, {
      addresses: [
        {
          id: 'addr-existing-1',
          label: 'Home',
          line1: '123 Main St',
          city: 'Mysuru',
          state: 'KA',
          pincode: '570001',
          isDefault: true,
          lat: null,
          lng: null,
        },
        addr1,
        addr2,
      ],
      addressIds: ['addr-existing-1', 'addr-pair-1', 'addr-pair-2'],
      updatedAt: new Date(),
    });
    batch.set(mirror1Ref, addr1);
    batch.set(mirror2Ref, addr2);

    await assertSucceeds(batch.commit());
  });

  it('DENY: Creating a mirror separately for a previously unpaired ID is rejected', async (ctx) => {
    if (!env) return ctx.skip();
    // Pre-seed an unpaired ID present in root addressIds without subcollection doc
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-existing-1', 'addr-previously-unpaired'],
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // Attempting a standalone create for addr-previously-unpaired must fail because it was already in addressIds
    await assertFails(
      setDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-previously-unpaired'), {
        id: 'addr-previously-unpaired',
        label: 'Late Mirror',
        line1: 'Late St',
        city: 'Mysuru',
        state: 'KA',
        pincode: '570001',
        isDefault: false,
        lat: null,
        lng: null,
      })
    );
  });

  it('DENY: Removing multiple IDs while deleting only one mirror is rejected', async (ctx) => {
    if (!env) return ctx.skip();
    // Pre-seed CUSTOMER_A_UID with 3 paired addresses
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-existing-1', 'addr-rem-2', 'addr-rem-3'],
      });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-rem-2'), {
        id: 'addr-rem-2',
        line1: 'Rem 2 St',
        city: 'Mysuru',
      });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-rem-3'), {
        id: 'addr-rem-3',
        line1: 'Rem 3 St',
        city: 'Mysuru',
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    // Adversarial update: Remove both addr-rem-2 and addr-rem-3 from addressIds
    batch.update(userRef, {
      addressIds: ['addr-existing-1'],
      updatedAt: new Date(),
    });
    // But only delete mirror for addr-rem-2 (leaving addr-rem-3 orphaned)
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-rem-2'));

    await assertFails(batch.commit());
  });

  it('DENY: Customer cannot append a duplicate of an existing address ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    // Adversarial: Trying to duplicate addr-existing-1 in addressIds
    batch.update(userRef, {
      addressIds: ['addr-existing-1', 'addr-existing-1'],
      updatedAt: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Customer cannot supply duplicate IDs within a dual addition', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    // Adversarial: Dual add with identical new IDs
    batch.update(userRef, {
      addressIds: ['addr-existing-1', 'addr-dup-both', 'addr-dup-both'],
      updatedAt: new Date(),
    });
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-dup-both'), {
      id: 'addr-dup-both',
      line1: 'Duplicate St',
      city: 'Mysuru',
    });

    await assertFails(batch.commit());
  });

  it('DENY: Customer cannot append an ID referencing an existing pre-created mirror without creating a genuinely new address', async (ctx) => {
    if (!env) return ctx.skip();
    // Pre-create an orphan mirror doc that is NOT in root addressIds
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-pre-existing-mirror'), {
        id: 'addr-pre-existing-mirror',
        line1: 'Pre-existing Mirror St',
        city: 'Mysuru',
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    // Attempting to append addr-pre-existing-mirror without creating a genuinely new doc
    batch.update(userRef, {
      addressIds: ['addr-existing-1', 'addr-pre-existing-mirror'],
      updatedAt: new Date(),
    });

    // Fails because mirror already existed before the batch (!exists was false)
    await assertFails(batch.commit());
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Position-independent deletion tests — removeAll() covers all indices
  // ─────────────────────────────────────────────────────────────────────────────

  it('ALLOW: Deletion of address at index 0 (first) in a 10-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const ids = Array.from({ length: 10 }, (_, i) => `addr-pos0-${i}`);
    const addresses = ids.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: ids, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: ids.slice(1),
      addresses: addresses.slice(1),
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-pos0-0'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of address at index 9 in a 10-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const tenIds = Array.from({ length: 10 }, (_, i) => `addr-pos9-${i}`);
    const addresses = tenIds.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: tenIds, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: tenIds.slice(0, 9),
      addresses: addresses.slice(0, 9),
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-pos9-9'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of address at index 10 (intermediate) in a 15-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const ids = Array.from({ length: 15 }, (_, i) => `addr-p10-${i}`);
    const addresses = ids.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: ids, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = ids.filter((id) => id !== 'addr-p10-10');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-p10-10');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-p10-10'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of address at index 20 (intermediate) in a 25-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const ids = Array.from({ length: 25 }, (_, i) => `addr-p20-${i}`);
    const addresses = ids.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: ids, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = ids.filter((id) => id !== 'addr-p20-20');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-p20-20');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-p20-20'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of address at index 21 (beyond prior unroll limit) in a 30-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const ids = Array.from({ length: 30 }, (_, i) => `addr-p21-${i}`);
    const addresses = ids.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: ids, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = ids.filter((id) => id !== 'addr-p21-21');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-p21-21');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-p21-21'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of address at index 50 (deep arbitrary position) in a 60-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const ids = Array.from({ length: 60 }, (_, i) => `addr-p50-${i}`);
    const addresses = ids.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: ids, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = ids.filter((id) => id !== 'addr-p50-50');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-p50-50');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-p50-50'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of first address in a 15-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const fifteenIds = Array.from({ length: 15 }, (_, i) => `addr-first15-${i}`);
    const addresses = fifteenIds.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: fifteenIds, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = fifteenIds.filter((id) => id !== 'addr-first15-0');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-first15-0');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-first15-0'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of middle address (index 7) in a 15-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const fifteenIds = Array.from({ length: 15 }, (_, i) => `addr-mid15-${i}`);
    const addresses = fifteenIds.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: fifteenIds, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = fifteenIds.filter((id) => id !== 'addr-mid15-7');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-mid15-7');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-mid15-7'));
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Deletion of last address in a 15-address list', async (ctx) => {
    if (!env) return ctx.skip();
    const fifteenIds = Array.from({ length: 15 }, (_, i) => `addr-last15-${i}`);
    const addresses = fifteenIds.map((id) => ({
      id,
      label: id,
      line1: `${id} St`,
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    }));
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), { addressIds: fifteenIds, addresses });
      for (const addr of addresses) {
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', addr.id), addr);
      }
    });
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    const batch = writeBatch(custDb);
    const remainingIds = fifteenIds.filter((id) => id !== 'addr-last15-14');
    const remainingAddrs = addresses.filter((a) => a.id !== 'addr-last15-14');
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addressIds: remainingIds,
      addresses: remainingAddrs,
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-last15-14'));
    await assertSucceeds(batch.commit());
  });

  // Legacy-label preservation tests (kept for regression continuity; new comprehensive position tests are above)

  it('DENY: Adding 3 IDs at once is rejected (exceeds demonstrable pairing threshold)', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    batch.update(userRef, {
      addressIds: ['addr-existing-1', 'addr-bulk-1', 'addr-bulk-2', 'addr-bulk-3'],
      updatedAt: new Date(),
    });
    for (const id of ['addr-bulk-1', 'addr-bulk-2', 'addr-bulk-3']) {
      batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', id), {
        id,
        label: id,
        line1: `${id} St`,
        city: 'Mysuru',
        state: 'KA',
        pincode: '570001',
        isDefault: false,
        lat: null,
        lng: null,
      });
    }

    await assertFails(batch.commit());
  });

  it('ALLOW: Inserting a new ID at index 0 (prepend) with a paired mirror is accepted', async (ctx) => {
    if (!env) return ctx.skip();
    // With removeAll()-based logic, position doesn't matter — a prepended new ID
    // with its mirror document created atomically is correctly identified as a
    // single legitimate addition regardless of its position in the list.
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const prependedAddr = {
      id: 'addr-prepended',
      label: 'Prepended',
      line1: 'Prepended St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    };
    const existingAddr = {
      id: 'addr-existing-1',
      label: 'Home',
      line1: '123 Main St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: true,
      lat: null,
      lng: null,
    };

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    batch.update(userRef, {
      addresses: [prependedAddr, existingAddr],
      addressIds: ['addr-prepended', 'addr-existing-1'],
      updatedAt: new Date(),
    });
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-prepended'), prependedAddr);

    await assertSucceeds(batch.commit());
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Legitimate Paired Address Operations (writeBatch)
  // ─────────────────────────────────────────────────────────────────────────────

  it('ALLOW: Legitimate paired address creation via atomic writeBatch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const newAddress = {
      id: 'addr-new-2',
      label: 'Office',
      line1: '789 Commercial Rd',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570005',
      isDefault: false,
      lat: null,
      lng: null,
    };

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    const addrRef = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', newAddress.id);

    batch.update(userRef, {
      addresses: [
        {
          id: 'addr-existing-1',
          label: 'Home',
          line1: '123 Main St',
          city: 'Mysuru',
          state: 'KA',
          pincode: '570001',
          isDefault: true,
          lat: null,
          lng: null,
        },
        newAddress,
      ],
      addressIds: ['addr-existing-1', 'addr-new-2'],
      updatedAt: new Date(),
    });
    batch.set(addrRef, newAddress);

    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Legitimate paired address deletion via atomic writeBatch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    const addrRef = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1');

    batch.update(userRef, {
      addresses: [],
      addressIds: [],
      defaultAddressId: null,
      updatedAt: new Date(),
    });
    batch.delete(addrRef);

    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Legitimate paired address update via atomic writeBatch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const updatedAddress = {
      id: 'addr-existing-1',
      label: 'Renovated Home',
      line1: '123 Main St, Suite 400',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: true,
      lat: 12.3,
      lng: 76.6,
    };

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', CUSTOMER_A_UID);
    const addrRef = doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1');

    batch.update(userRef, {
      addresses: [updatedAddress],
      addressIds: ['addr-existing-1'],
      updatedAt: new Date(),
    });
    batch.set(addrRef, updatedAddress);

    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Unrelated root user profile update (e.g. fullName) succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Normal profile update without touching addresses
    await assertSucceeds(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        fullName: 'Customer A Renamed',
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Cross-Customer Authorization (IDOR Protection)
  // ─────────────────────────────────────────────────────────────────────────────

  it("DENY: Customer B cannot create an address under Customer A's account", async (ctx) => {
    if (!env) return ctx.skip();
    const custBDb = env.authenticatedContext(CUSTOMER_B_UID).firestore();

    await assertFails(
      setDoc(doc(custBDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-b-injected'), {
        id: 'addr-b-injected',
        line1: 'Malicious Injected Address',
        city: 'Mysuru',
      })
    );
  });

  it("DENY: Customer B cannot update an address under Customer A's account", async (ctx) => {
    if (!env) return ctx.skip();
    const custBDb = env.authenticatedContext(CUSTOMER_B_UID).firestore();

    await assertFails(
      updateDoc(doc(custBDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'), {
        line1: 'Hijacked by B',
      })
    );
  });

  it("DENY: Customer B cannot delete an address under Customer A's account", async (ctx) => {
    if (!env) return ctx.skip();
    const custBDb = env.authenticatedContext(CUSTOMER_B_UID).firestore();

    await assertFails(
      deleteDoc(doc(custBDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'))
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Legacy-Client Denial & Document Preservation Verification (Section 6.A)
  // ─────────────────────────────────────────────────────────────────────────────

  it('DENY & PRESERVE (6.A.1 / Case A): Root-only address creation on legacy profile with missing addressIds is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const LEGACY_UID = 'uid-legacy-no-ids';
    const initialAddresses = [
      {
        id: 'addr-leg-1',
        label: 'Home',
        line1: '1 Legacy St',
        city: 'Mysuru',
        state: 'KA',
        pincode: '570001',
        isDefault: true,
        lat: null,
        lng: null,
      },
    ];

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', LEGACY_UID), {
        id: LEGACY_UID,
        role: 'customer',
        isActive: true,
        fullName: 'Legacy User',
        addresses: initialAddresses,
      });
    });

    const legacyDb = env.authenticatedContext(LEGACY_UID).firestore();
    const newAddr = {
      id: 'addr-leg-2',
      label: 'Office',
      line1: '2 Legacy St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570002',
      isDefault: false,
      lat: null,
      lng: null,
    };

    // Old client writes addresses only without addressIds or mirror doc
    await assertFails(
      updateDoc(doc(legacyDb, 'users', LEGACY_UID), {
        addresses: [...initialAddresses, newAddr],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', LEGACY_UID));
      expect(snap.data()?.addresses).toEqual(initialAddresses);
      expect(snap.data()?.addressIds).toBeUndefined();
      const mirrorSnap = await getDoc(doc(db, 'users', LEGACY_UID, 'addresses', 'addr-leg-2'));
      expect(mirrorSnap.exists()).toBe(false);
    });
  });

  it('DENY & PRESERVE (6.A.2 / Case B): Root-only address creation on profile with addressIds is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const newAddr = {
      id: 'addr-root-only-add',
      label: 'Shop',
      line1: '3 Root St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    };

    // Client attempts to append newAddr to addresses without updating addressIds or mirror
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addresses: [
          {
            id: 'addr-existing-1',
            label: 'Home',
            line1: '123 Main St',
            city: 'Mysuru',
            state: 'KA',
            pincode: '570001',
            isDefault: true,
            lat: null,
            lng: null,
          },
          newAddr,
        ],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addresses).toHaveLength(1);
      expect(snap.data()?.addresses[0].id).toBe('addr-existing-1');
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-root-only-add'));
      expect(mirrorSnap.exists()).toBe(false);
    });
  });

  it('DENY & PRESERVE (6.A.3 / Case B): Root-only address editing without mirror update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Client edits root addresses array without updating the mirror document
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addresses: [
          {
            id: 'addr-existing-1',
            label: 'Tampered Label',
            line1: 'Tampered Line 1',
            city: 'Mysuru',
            state: 'KA',
            pincode: '570001',
            isDefault: true,
            lat: null,
            lng: null,
          },
        ],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addresses[0].label).toBe('Home');
      expect(snap.data()?.addresses[0].line1).toBe('123 Main St');
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(mirrorSnap.data()?.label).toBe('Home');
      expect(mirrorSnap.data()?.line1).toBe('123 Main St');
    });
  });

  it('DENY & PRESERVE (6.A.4 / Case B): Root-only address deletion without mirror deletion is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Client empties root addresses array without updating addressIds or deleting mirror
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addresses: [],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addresses).toHaveLength(1);
      expect(snap.data()?.addresses[0].id).toBe('addr-existing-1');
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(mirrorSnap.exists()).toBe(true);
    });
  });

  it('DENY & PRESERVE (6.A.5): Index-only addition without addresses update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Attempting to append an ID to addressIds without updating addresses array
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-existing-1', 'addr-index-only'],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
      expect(snap.data()?.addresses).toHaveLength(1);
    });
  });

  it('DENY & PRESERVE (6.A.6): Index-only deletion without addresses update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Attempting to drop an ID from addressIds without updating addresses array
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addressIds: [],
      })
    );

    // Verify document remains completely unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
      expect(snap.data()?.addresses).toHaveLength(1);
    });
  });

  it('DENY & PRESERVE (6.A.7): Mirror-only creation without root user update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      setDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-mirror-orphan'), {
        id: 'addr-mirror-orphan',
        label: 'Orphan',
        line1: '9 Orphan St',
        city: 'Mysuru',
        state: 'KA',
        pincode: '570001',
        isDefault: false,
        lat: null,
        lng: null,
      })
    );

    // Verify document does not exist
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-mirror-orphan'));
      expect(snap.exists()).toBe(false);
    });
  });

  it('DENY & PRESERVE (6.A.8): Mirror-only update without root user update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'), {
        line1: 'Direct Mirror Update St',
      })
    );

    // Verify mirror document remains unchanged
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(snap.data()?.line1).toBe('123 Main St');
    });
  });

  it('DENY & PRESERVE (6.A.9): Mirror-only deletion without root user update is denied and leaves doc unchanged', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      deleteDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'))
    );

    // Verify mirror document still exists
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(snap.exists()).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Additional New-Client Success & Profile Operations (Section 6.B)
  // ─────────────────────────────────────────────────────────────────────────────

  it('ALLOW (6.B.8): Profile updates with phone and defaultAddressId succeed without touching address arrays', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertSucceeds(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        phone: '+919876543210',
        defaultAddressId: 'addr-existing-1',
        fullName: 'Customer A Updated Phone',
      })
    );

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.phone).toBe('+919876543210');
      expect(snap.data()?.defaultAddressId).toBe('addr-existing-1');
      expect(snap.data()?.fullName).toBe('Customer A Updated Phone');
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
    });
  });

  it('ALLOW (6.B.10): Legacy profile with 0 addresses can add first address atomically via new client', async (ctx) => {
    if (!env) return ctx.skip();
    const ZERO_UID = 'uid-legacy-zero-addresses';

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', ZERO_UID), {
        id: ZERO_UID,
        role: 'customer',
        isActive: true,
        fullName: 'Zero Address Customer',
        addresses: [],
        addressIds: [],
        defaultAddressId: null,
      });
    });

    const custDb = env.authenticatedContext(ZERO_UID).firestore();
    const newAddress = {
      id: 'addr-first-ever',
      label: 'First Home',
      line1: '1 First Ave',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: true,
      lat: null,
      lng: null,
    };

    const batch = writeBatch(custDb);
    const userRef = doc(custDb, 'users', ZERO_UID);
    const addrRef = doc(custDb, 'users', ZERO_UID, 'addresses', newAddress.id);

    batch.update(userRef, {
      addresses: [newAddress],
      addressIds: [newAddress.id],
      defaultAddressId: newAddress.id,
      updatedAt: new Date(),
    });
    batch.set(addrRef, newAddress);

    await assertSucceeds(batch.commit());

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const userSnap = await getDoc(doc(db, 'users', ZERO_UID));
      expect(userSnap.data()?.addressIds).toEqual(['addr-first-ever']);
      expect(userSnap.data()?.addresses).toEqual([newAddress]);
      const mirrorSnap = await getDoc(doc(db, 'users', ZERO_UID, 'addresses', 'addr-first-ever'));
      expect(mirrorSnap.exists()).toBe(true);
      expect(mirrorSnap.data()).toEqual(newAddress);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Security Invariants & Protected Fields (Section 6.C)
  // ─────────────────────────────────────────────────────────────────────────────

  it('DENY (6.C): Customer cannot modify protected field (role) even during valid address update', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        role: 'admin',
      })
    );

    // Verify role remained customer
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.role).toBe('customer');
    });
  });

  it('DENY (6.C): Customer cannot modify creditBalance directly', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        creditBalance: 10000,
      })
    );

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.creditBalance).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Comprehensive Adversarial Identity-Matching Suite (Section 5)
  // ─────────────────────────────────────────────────────────────────────────────

  it('DENY & PRESERVE (5.1 / Critical): Delete address A from addresses but remove ID B from addressIds is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const TEST_UID = 'uid-adv-del-mismatch-1';
    const addrA = { id: 'A', label: 'Home', line1: 'A St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const addrB = { id: 'B', label: 'Office', line1: 'B St', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await setDoc(doc(db, 'users', TEST_UID), {
        id: TEST_UID,
        role: 'customer',
        isActive: true,
        addresses: [addrA, addrB],
        addressIds: ['A', 'B'],
        defaultAddressId: 'A',
      });
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'), addrA);
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'), addrB);
    });

    const custDb = env.authenticatedContext(TEST_UID).firestore();
    const batch = writeBatch(custDb);
    // Malicious batch: drops A from addresses, but drops B from addressIds, and deletes mirror B
    batch.update(doc(custDb, 'users', TEST_UID), {
      addresses: [addrB],
      addressIds: ['A'],
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', TEST_UID, 'addresses', 'B'));

    await assertFails(batch.commit());

    // Verify all 3 documents remain completely unchanged
    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const userSnap = await getDoc(doc(db, 'users', TEST_UID));
      expect(userSnap.data()?.addresses).toEqual([addrA, addrB]);
      expect(userSnap.data()?.addressIds).toEqual(['A', 'B']);
      const mirrorASnap = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'));
      expect(mirrorASnap.exists()).toBe(true);
      const mirrorBSnap = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'));
      expect(mirrorBSnap.exists()).toBe(true);
    });
  });

  it('DENY & PRESERVE (5.2): Delete address B from addresses but remove ID A from addressIds is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const TEST_UID = 'uid-adv-del-mismatch-2';
    const addrA = { id: 'A', label: 'Home', line1: 'A St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const addrB = { id: 'B', label: 'Office', line1: 'B St', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await setDoc(doc(db, 'users', TEST_UID), {
        id: TEST_UID,
        role: 'customer',
        isActive: true,
        addresses: [addrA, addrB],
        addressIds: ['A', 'B'],
        defaultAddressId: 'A',
      });
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'), addrA);
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'), addrB);
    });

    const custDb = env.authenticatedContext(TEST_UID).firestore();
    const batch = writeBatch(custDb);
    // Malicious batch: drops B from addresses, but drops A from addressIds, and deletes mirror A
    batch.update(doc(custDb, 'users', TEST_UID), {
      addresses: [addrA],
      addressIds: ['B'],
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', TEST_UID, 'addresses', 'A'));

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const userSnap = await getDoc(doc(db, 'users', TEST_UID));
      expect(userSnap.data()?.addresses).toEqual([addrA, addrB]);
      expect(userSnap.data()?.addressIds).toEqual(['A', 'B']);
      const snapA = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'));
      expect(snapA.exists()).toBe(true);
      const snapB = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'));
      expect(snapB.exists()).toBe(true);
    });
  });

  it('DENY & PRESERVE (5.3): Delete address A from root and index but delete mirror B is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const TEST_UID = 'uid-adv-del-wrong-mirror';
    const addrA = { id: 'A', label: 'Home', line1: 'A St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const addrB = { id: 'B', label: 'Office', line1: 'B St', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await setDoc(doc(db, 'users', TEST_UID), {
        id: TEST_UID,
        role: 'customer',
        isActive: true,
        addresses: [addrA, addrB],
        addressIds: ['A', 'B'],
        defaultAddressId: 'A',
      });
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'), addrA);
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'), addrB);
    });

    const custDb = env.authenticatedContext(TEST_UID).firestore();
    const batch = writeBatch(custDb);
    // Root correctly removes A, but batch deletes mirror B instead of mirror A
    batch.update(doc(custDb, 'users', TEST_UID), {
      addresses: [addrB],
      addressIds: ['B'],
      updatedAt: new Date(),
    });
    batch.delete(doc(custDb, 'users', TEST_UID, 'addresses', 'B'));

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const userSnap = await getDoc(doc(db, 'users', TEST_UID));
      expect(userSnap.data()?.addressIds).toEqual(['A', 'B']);
      const snapB = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'));
      expect(snapB.exists()).toBe(true);
    });
  });

  it('DENY & PRESERVE (5.4): Add address map X while adding index ID Y is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const addrX = { id: 'addr-X', label: 'Shop', line1: 'X St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: false, lat: null, lng: null };
    const batch = writeBatch(custDb);
    // Root addresses gets addrX (id: 'addr-X'), but addressIds gets 'addr-Y'
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addresses: [
        { id: 'addr-existing-1', label: 'Home', line1: '123 Main St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null },
        addrX,
      ],
      addressIds: ['addr-existing-1', 'addr-Y'],
      updatedAt: new Date(),
    });
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-Y'), {
      ...addrX,
      id: 'addr-Y',
    });

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const userSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(userSnap.data()?.addressIds).toEqual(['addr-existing-1']);
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-Y'));
      expect(mirrorSnap.exists()).toBe(false);
    });
  });

  it('DENY & PRESERVE (5.5): Dual addition with mismatched mirror-to-index IDs is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const addrC = { id: 'addr-C', label: 'C', line1: 'C St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: false, lat: null, lng: null };
    const addrE = { id: 'addr-E', label: 'E', line1: 'E St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: false, lat: null, lng: null };

    const batch = writeBatch(custDb);
    // addressIds has ['C', 'D'], but addresses has [addrC, addrE]
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addresses: [
        { id: 'addr-existing-1', label: 'Home', line1: '123 Main St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null },
        addrC,
        addrE,
      ],
      addressIds: ['addr-existing-1', 'addr-C', 'addr-D'],
      updatedAt: new Date(),
    });
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-C'), addrC);
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-D'), { ...addrE, id: 'addr-D' });

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
    });
  });

  it('DENY & PRESERVE (5.6): Create mirror path A with embedded address ID B is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const batch = writeBatch(custDb);
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addresses: [
        { id: 'addr-existing-1', label: 'Home', line1: '123 Main St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null },
        { id: 'path-A', label: 'Spoofed', line1: 'Spoof St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: false, lat: null, lng: null },
      ],
      addressIds: ['addr-existing-1', 'path-A'],
      updatedAt: new Date(),
    });
    // Mirror document path is 'path-A', but its body ID is 'embedded-B'
    batch.set(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'path-A'), {
      id: 'embedded-B',
      label: 'Spoofed',
      line1: 'Spoof St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: false,
      lat: null,
      lng: null,
    });

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'path-A'));
      expect(mirrorSnap.exists()).toBe(false);
    });
  });

  it('DENY & PRESERVE (5.7): Update mirror path A with embedded address ID B is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Adversarial single update trying to tamper embedded ID
    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'), {
        id: 'addr-tampered-id-b',
        line1: 'Tampered Address',
      })
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(snap.data()?.id).toBe('addr-existing-1');
    });
  });

  it('DENY & PRESERVE (5.8): Update address A in root while modifying mirror B is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const TEST_UID = 'uid-adv-edit-mismatch';
    const addrA = { id: 'A', label: 'Home', line1: 'A St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const addrB = { id: 'B', label: 'Office', line1: 'B St', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await setDoc(doc(db, 'users', TEST_UID), {
        id: TEST_UID,
        role: 'customer',
        isActive: true,
        addresses: [addrA, addrB],
        addressIds: ['A', 'B'],
        defaultAddressId: 'A',
      });
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'), addrA);
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'), addrB);
    });

    const custDb = env.authenticatedContext(TEST_UID).firestore();
    const batch = writeBatch(custDb);
    // Root edits A, but batch updates mirror B
    const updatedA = { ...addrA, line1: 'A St Renovated' };
    const updatedB = { ...addrB, line1: 'B St Renovated' };

    batch.update(doc(custDb, 'users', TEST_UID), {
      addresses: [updatedA, addrB],
      addressIds: ['A', 'B'],
      updatedAt: new Date(),
    });
    batch.set(doc(custDb, 'users', TEST_UID, 'addresses', 'B'), updatedB);

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snapA = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'));
      expect(snapA.data()?.line1).toBe('A St');
      const snapB = await getDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'));
      expect(snapB.data()?.line1).toBe('B St');
    });
  });

  it('DENY & PRESERVE (5.9): Delete mirror while retaining root address is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      deleteDoc(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'))
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(mirrorSnap.exists()).toBe(true);
    });
  });

  it('DENY & PRESERVE (5.10): Remove root address while retaining mirror is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addresses: [],
        addressIds: [],
      })
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const mirrorSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-existing-1'));
      expect(mirrorSnap.exists()).toBe(true);
      const userSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(userSnap.data()?.addressIds).toEqual(['addr-existing-1']);
    });
  });

  it('DENY & PRESERVE (5.11): Reorder addresses in root without valid mutation is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const TEST_UID = 'uid-adv-reorder';
    const addrA = { id: 'A', label: 'Home', line1: 'A St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const addrB = { id: 'B', label: 'Office', line1: 'B St', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      await setDoc(doc(db, 'users', TEST_UID), {
        id: TEST_UID,
        role: 'customer',
        isActive: true,
        addresses: [addrA, addrB],
        addressIds: ['A', 'B'],
        defaultAddressId: 'A',
      });
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'A'), addrA);
      await setDoc(doc(db, 'users', TEST_UID, 'addresses', 'B'), addrB);
    });

    const custDb = env.authenticatedContext(TEST_UID).firestore();
    // Reorder addresses to [B, A] without valid mutation
    await assertFails(
      updateDoc(doc(custDb, 'users', TEST_UID), {
        addresses: [addrB, addrA],
        addressIds: ['A', 'B'],
      })
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', TEST_UID));
      expect(snap.data()?.addresses).toEqual([addrA, addrB]);
    });
  });

  it('DENY & PRESERVE (5.12): Duplicate address IDs in addressIds is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertFails(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-existing-1', 'addr-existing-1'],
      })
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
    });
  });

  it('DENY & PRESERVE (5.13): Duplicate embedded address IDs in root addresses array is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    const existingAddr = { id: 'addr-existing-1', label: 'Home', line1: '123 Main St', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
    const batch = writeBatch(custDb);
    // Duplicate existingAddr in addresses array
    batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
      addresses: [existingAddr, existingAddr],
      addressIds: ['addr-existing-1'],
      updatedAt: new Date(),
    });

    await assertFails(batch.commit());

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.addresses).toHaveLength(1);
    });
  });

  it('DENY & PRESERVE (5.14): Customer A attempting to manipulate Customer B address is denied', async (ctx) => {
    if (!env) return ctx.skip();
    const custADb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    // Customer A attempts to delete Customer B's mirror address
    await assertFails(
      deleteDoc(doc(custADb, 'users', CUSTOMER_B_UID, 'addresses', 'addr-cust-b'))
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_B_UID, 'addresses', 'addr-cust-b'));
      expect(snap.exists()).toBe(true);
    });
  });

  it('ALLOW (5.15): Unrelated profile updates continue working cleanly without touching addresses', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

    await assertSucceeds(
      updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
        fullName: 'Customer A Profile Verified',
        phone: '+919988776655',
        defaultAddressId: 'addr-existing-1',
      })
    );

    await env.withSecurityRulesDisabled(async (ctx2) => {
      const db = ctx2.firestore();
      const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
      expect(snap.data()?.fullName).toBe('Customer A Profile Verified');
      expect(snap.data()?.phone).toBe('+919988776655');
      expect(snap.data()?.addressIds).toEqual(['addr-existing-1']);
      expect(snap.data()?.addresses).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Case 0 Address Duplication & Reordering Verification (Section 2 & 4)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Case 0 Address Duplication & Reordering Verification', () => {
    const addrA = {
      id: 'A',
      label: 'Home',
      line1: '123 Main St',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: true,
      lat: null,
      lng: null,
    };
    const addrB = {
      id: 'B',
      label: 'Office',
      line1: '456 Office Rd',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570002',
      isDefault: false,
      lat: null,
      lng: null,
    };

    beforeEach(async (ctx) => {
      if (!env) return ctx.skip();
      await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
          id: CUSTOMER_A_UID,
          role: 'customer',
          isActive: true,
          fullName: 'Customer Two Addrs',
          addresses: [addrA, addrB],
          addressIds: ['A', 'B'],
          defaultAddressId: 'A',
        });
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'A'), addrA);
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'B'), addrB);
      });
    });

    it('DENY & PRESERVE: Section 2 exact reproduction - root-only update duplicating address A [A, A, B] with unchanged addressIds ["A", "B"]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrA, addrB],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const rootSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(rootSnap.data()?.addresses).toEqual([addrA, addrB]);
        expect(rootSnap.data()?.addressIds).toEqual(['A', 'B']);

        const mirrorA = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'A'));
        expect(mirrorA.exists()).toBe(true);
        expect(mirrorA.data()?.label).toBe('Home');

        const mirrorB = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'B'));
        expect(mirrorB.exists()).toBe(true);
        expect(mirrorB.data()?.label).toBe('Office');
      });
    });

    it('DENY & PRESERVE (Test 1): Append an exact duplicate of address A [A, B, A] without changing addressIds', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrB, addrA],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('DENY & PRESERVE (Test 2): Insert an exact duplicate of address A between A and B [A, A, B]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrA, addrB],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('DENY & PRESERVE (Test 3): Append a duplicate of address B [A, B, B]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrB, addrB],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('DENY & PRESERVE (Test 4): Duplicate an address map while retaining its original embedded ID', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      const dupB = { ...addrB };
      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrB, dupB],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('DENY & PRESERVE (Test 5): Reorder root address maps without changing addressIds [B, A]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrB, addrA],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('DENY & PRESERVE (Test 6): Reorder addressIds independently of root addresses ["B", "A"]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrB],
          addressIds: ['B', 'A'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addressIds).toEqual(['A', 'B']);
      });
    });

    it('DENY & PRESERVE (Test 7): Duplicate an ID in addressIds ["A", "A", "B"]', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [addrA, addrB],
          addressIds: ['A', 'A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addressIds).toEqual(['A', 'B']);
      });
    });

    it('DENY & PRESERVE (Test 8): Change an address map embedded ID without changing the index', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      const mutatedAddrA = { ...addrA, id: 'C' };
      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: [mutatedAddrA, addrB],
          addressIds: ['A', 'B'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
      });
    });

    it('ALLOW (Test 9): Perform an unrelated profile update without changing either address list', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertSucceeds(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          fullName: 'Customer Two Addrs Verified',
          phone: '+919988776655',
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.fullName).toBe('Customer Two Addrs Verified');
        expect(snap.data()?.phone).toBe('+919988776655');
        expect(snap.data()?.addresses).toEqual([addrA, addrB]);
        expect(snap.data()?.addressIds).toEqual(['A', 'B']);
      });
    });

    it('ALLOW (Test 10): Perform an unrelated update on a legacy profile whose addressIds field is absent', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyUid = 'legacy-cust-no-ids';
      await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'users', legacyUid), {
          id: legacyUid,
          role: 'customer',
          isActive: true,
          fullName: 'Legacy Customer',
          addresses: [addrA],
          // addressIds field is intentionally ABSENT
        });
      });

      const legacyDb = env.authenticatedContext(legacyUid).firestore();
      await assertSucceeds(
        updateDoc(doc(legacyDb, 'users', legacyUid), {
          fullName: 'Legacy Customer Profile Updated',
          phone: '+919876543210',
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', legacyUid));
        expect(snap.data()?.fullName).toBe('Legacy Customer Profile Updated');
        expect(snap.data()?.phone).toBe('+919876543210');
        expect(snap.data()?.addresses).toEqual([addrA]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Final Legacy Address Profile Compatibility Audit (Section 2 & 5)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Final Legacy Address Profile Compatibility Audit', () => {
    const legacyAddr1 = {
      id: 'legacy-addr-1',
      label: 'Home',
      line1: '100 Heritage Rd',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570001',
      isDefault: true,
      lat: null,
      lng: null,
    };
    const legacyAddr2 = {
      id: 'legacy-addr-2',
      label: 'Office',
      line1: '200 Heritage Blvd',
      city: 'Mysuru',
      state: 'KA',
      pincode: '570002',
      isDefault: false,
      lat: null,
      lng: null,
    };

    const LEGACY_SINGLE_UID = 'cust-legacy-single-addr';
    const LEGACY_MULTI_UID = 'cust-legacy-multi-addr';

    beforeEach(async (ctx) => {
      if (!env) return ctx.skip();
      await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        // Profile C: Legacy profile with one existing address, addressIds absent
        await setDoc(doc(db, 'users', LEGACY_SINGLE_UID), {
          id: LEGACY_SINGLE_UID,
          role: 'customer',
          isActive: true,
          fullName: 'Legacy Single Address',
          addresses: [legacyAddr1],
          // addressIds explicitly absent
        });
        // Profile D: Legacy profile with multiple existing addresses, addressIds absent
        await setDoc(doc(db, 'users', LEGACY_MULTI_UID), {
          id: LEGACY_MULTI_UID,
          role: 'customer',
          isActive: true,
          fullName: 'Legacy Multi Address',
          addresses: [legacyAddr1, legacyAddr2],
          // addressIds explicitly absent
        });
      });
    });

    it('ALLOW (Section 5.1): Legacy profile with one root address and missing addressIds - unrelated update succeeds and address data stays identical', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyDb = env.authenticatedContext(LEGACY_SINGLE_UID).firestore();

      await assertSucceeds(
        updateDoc(doc(legacyDb, 'users', LEGACY_SINGLE_UID), {
          fullName: 'Legacy Customer One Renamed',
          phone: '+919876500001',
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', LEGACY_SINGLE_UID));
        expect(snap.data()?.fullName).toBe('Legacy Customer One Renamed');
        expect(snap.data()?.phone).toBe('+919876500001');
        expect(snap.data()?.addresses).toEqual([legacyAddr1]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });

    it('ALLOW (Section 5.2): Legacy profile with multiple root addresses and missing addressIds - unrelated update succeeds and address data stays identical', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyDb = env.authenticatedContext(LEGACY_MULTI_UID).firestore();

      await assertSucceeds(
        updateDoc(doc(legacyDb, 'users', LEGACY_MULTI_UID), {
          fullName: 'Legacy Customer Multi Renamed',
          phone: '+919876500002',
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', LEGACY_MULTI_UID));
        expect(snap.data()?.fullName).toBe('Legacy Customer Multi Renamed');
        expect(snap.data()?.phone).toBe('+919876500002');
        expect(snap.data()?.addresses).toEqual([legacyAddr1, legacyAddr2]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });

    it('DENY & PRESERVE (Section 5.3): Legacy profile with existing addresses - root-only address edit is denied and doc unchanged', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyDb = env.authenticatedContext(LEGACY_SINGLE_UID).firestore();

      const editedAddr = { ...legacyAddr1, label: 'Altered Home' };
      await assertFails(
        updateDoc(doc(legacyDb, 'users', LEGACY_SINGLE_UID), {
          addresses: [editedAddr],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', LEGACY_SINGLE_UID));
        expect(snap.data()?.addresses).toEqual([legacyAddr1]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });

    it('DENY & PRESERVE (Section 5.4): Legacy profile with existing addresses - root-only address deletion is denied and doc unchanged', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyDb = env.authenticatedContext(LEGACY_MULTI_UID).firestore();

      await assertFails(
        updateDoc(doc(legacyDb, 'users', LEGACY_MULTI_UID), {
          addresses: [legacyAddr1],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', LEGACY_MULTI_UID));
        expect(snap.data()?.addresses).toEqual([legacyAddr1, legacyAddr2]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });

    it('DENY & PRESERVE (Section 5.5): Legacy profile with existing addresses - incomplete index creation without mirrors is denied and doc unchanged', async (ctx) => {
      if (!env) return ctx.skip();
      const legacyDb = env.authenticatedContext(LEGACY_SINGLE_UID).firestore();

      await assertFails(
        updateDoc(doc(legacyDb, 'users', LEGACY_SINGLE_UID), {
          addressIds: ['legacy-addr-1'],
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', LEGACY_SINGLE_UID));
        expect(snap.data()?.addresses).toEqual([legacyAddr1]);
        expect(snap.data()?.addressIds).toBeUndefined();
      });
    });

    it('ALLOW (Section 5.6): Indexed customer - unrelated profile update succeeds', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await assertSucceeds(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          fullName: 'Indexed Customer Name Verified',
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.fullName).toBe('Indexed Customer Name Verified');
        expect(snap.data()?.addressIds).toBeDefined();
      });
    });

    it('DENY & PRESERVE (Section 5.7): Duplicate-address Case 0 attack remains denied', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
          id: CUSTOMER_A_UID,
          role: 'customer',
          isActive: true,
          addresses: [legacyAddr1],
          addressIds: ['legacy-addr-1'],
        });
      });

      const dupAddrs = [legacyAddr1, legacyAddr1];

      await assertFails(
        updateDoc(doc(custDb, 'users', CUSTOMER_A_UID), {
          addresses: dupAddrs,
        })
      );

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const snap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(snap.data()?.addresses).toEqual([legacyAddr1]);
      });
    });

    it('DENY & PRESERVE (Section 5.8): Cross-deletion identity mismatch remains denied and documents preserved', async (ctx) => {
      if (!env) return ctx.skip();
      const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();

      // Seed A and B with mirrors
      const addrA = { id: 'A', label: 'Home', line1: '123 Main', city: 'Mysuru', state: 'KA', pincode: '570001', isDefault: true, lat: null, lng: null };
      const addrB = { id: 'B', label: 'Office', line1: '456 Off', city: 'Mysuru', state: 'KA', pincode: '570002', isDefault: false, lat: null, lng: null };

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
          id: CUSTOMER_A_UID,
          role: 'customer',
          isActive: true,
          addresses: [addrA, addrB],
          addressIds: ['A', 'B'],
        });
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'A'), addrA);
        await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'B'), addrB);
      });

      // Attacker batch: delete address B from root, drop ID A from addressIds, delete mirror A
      const batch = writeBatch(custDb);
      batch.update(doc(custDb, 'users', CUSTOMER_A_UID), {
        addresses: [addrA],
        addressIds: ['B'],
      });
      batch.delete(doc(custDb, 'users', CUSTOMER_A_UID, 'addresses', 'A'));

      await assertFails(batch.commit());

      await env.withSecurityRulesDisabled(async (ctx2) => {
        const db = ctx2.firestore();
        const rootSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID));
        expect(rootSnap.data()?.addresses).toEqual([addrA, addrB]);
        expect(rootSnap.data()?.addressIds).toEqual(['A', 'B']);

        const mirrorASnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'A'));
        expect(mirrorASnap.exists()).toBe(true);
        const mirrorBSnap = await getDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'B'));
        expect(mirrorBSnap.exists()).toBe(true);
      });
    });
  });
});
