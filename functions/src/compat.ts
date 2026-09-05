import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';

const getDb = () => {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || 'demo-test' });
  }
  return getFirestore();
};

export const doc = (dbRef: any, col: string, id: string, ...rest: string[]) => {
  const db = getDb();
  if (rest.length > 0) {
    let ref: any = db.collection(col).doc(id);
    for (let i = 0; i < rest.length; i += 2) {
      if (i + 1 < rest.length) {
        ref = ref.collection(rest[i]).doc(rest[i+1]);
      } else {
        ref = ref.collection(rest[i]);
      }
    }
    return ref;
  }
  return db.collection(col).doc(id);
};

export const getDoc = async (ref: any) => await ref.get();
export const writeBatch = (dbRef: any) => getDb().batch();
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const collection = (dbRef: any, path: string) => getDb().collection(path);
export const where = (field: string, op: any, val: any) => ({field, op, val});
export const query = (coll: any, ...constraints: any[]) => {
  let q = coll;
  for (const c of constraints) {
     q = q.where(c.field, c.op, c.val);
  }
  return q;
};
export const getDocs = async (q: any) => await q.get();

export const db = {};
