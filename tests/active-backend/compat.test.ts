process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as compat from '../../functions/src/compat';
import { initTestApp } from '../../functions/src/test-init';
import { getFirestore } from 'firebase-admin/firestore';

beforeAll(() => {
  initTestApp();
});

describe('compat.ts (integration)', () => {
  it('doc and getDoc', async () => {
    const db = getFirestore();
    const docId = 'compat_doc_' + Date.now();
    await db.collection('compat_col').doc(docId).set({ test: 123 });
    
    const ref = compat.doc(null, 'compat_col', docId);
    const snap = await compat.getDoc(ref);
    expect(snap.exists).toBe(true);
    expect(snap.data()?.test).toBe(123);
  });

  it('nested doc', async () => {
    const db = getFirestore();
    const docId = 'compat_doc_nested_' + Date.now();
    await db.collection('compat_col').doc(docId).collection('sub').doc('s1').set({ nested: true });
    
    const ref = compat.doc(null, 'compat_col', docId, 'sub', 's1');
    const snap = await compat.getDoc(ref);
    expect(snap.exists).toBe(true);
    expect(snap.data()?.nested).toBe(true);
  });

  it('collection', async () => {
    const coll = compat.collection(null, 'compat_col');
    expect(coll).toBeDefined();
  });

  it('writeBatch', async () => {
    const batch = compat.writeBatch(null);
    const docId = 'batch_doc_' + Date.now();
    const ref = compat.doc(null, 'compat_col', docId);
    batch.set(ref, { batched: true });
    await batch.commit();

    const snap = await compat.getDoc(ref);
    expect(snap.data()?.batched).toBe(true);
  });

  it('serverTimestamp', () => {
    const ts = compat.serverTimestamp();
    expect(ts).toBeDefined();
  });

  it('query and getDocs', async () => {
    const val = 'query_val_' + Date.now();
    await getFirestore().collection('compat_col').add({ queryField: val });
    
    const coll = compat.collection(null, 'compat_col');
    const c1 = compat.where('queryField', '==', val);
    const q = compat.query(coll, c1);
    
    const snaps = await compat.getDocs(q);
    expect(snaps.empty).toBe(false);
    expect(snaps.docs[0].data().queryField).toBe(val);
  });
});
