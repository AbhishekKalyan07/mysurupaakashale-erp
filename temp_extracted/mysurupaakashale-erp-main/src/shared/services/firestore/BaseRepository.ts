import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  getCountFromServer,
  type CollectionReference,
  type Firestore,
  type FirestoreDataConverter,
  type PartialWithFieldValue,
  type QueryConstraint,
  type Unsubscribe,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';

/**
 * Firestore document converter for the common case: `T` always carries its
 * own `id` field mirroring the document id. Reconstructing `id` from
 * `snapshot.id` on every read (rather than trusting the stored field) means
 * it's always correct even if a stored value somehow drifted.
 *
 * Declares `DbModelType = T` (not the default `DocumentData`) so
 * `DocumentReference<T, T>` comes out of `.withConverter(...)` — that's
 * what lets `updateDoc(ref, partialData)` below type-check against `T`
 * instead of a bare, untyped `DocumentData`.
 */
export function createConverter<T extends { id: string }>(): FirestoreDataConverter<T, T> {
  const toFirestore = (modelObject: WithFieldValue<T> | PartialWithFieldValue<T>) => modelObject;
  return {
    // Pass-through in both the full-set and merge-set cases — cast to the
    // interface's own (overloaded) method type rather than fight TypeScript's
    // structural variance rules for a function that is genuinely identical
    // either way.
    toFirestore: toFirestore as FirestoreDataConverter<T, T>['toFirestore'],
    fromFirestore(snapshot, options): T {
      const data = snapshot.data(options);
      return { ...data, id: snapshot.id } as T;
    },
  };
}

/**
 * Generic Firestore repository. One instance per collection (see
 * userRepository.ts for the pattern) so every feature's data-access class
 * shares the same tested CRUD implementation — this is the piece
 * TanStack Query hooks call into, and the only place raw Firestore SDK
 * calls should appear outside of Cloud Functions.
 *
 * Note on `delete`: several collections (invoices, payments, and anything
 * with audit-history requirements) are intentionally NOT client-deletable —
 * see firestore.rules. This base class exposes `delete` for the
 * collections that do allow it (e.g. an admin removing a draft MealOption);
 * feature repositories for append-only collections simply shouldn't call it,
 * and the security rules reject the attempt either way.
 */
export class BaseRepository<T extends { id: string }> {
  protected readonly collectionRef: CollectionReference<T, T>;

  constructor(db: Firestore, collectionPath: string, converter: FirestoreDataConverter<T, T>) {
    this.collectionRef = collection(db, collectionPath).withConverter(converter);
  }

  async getById(id: string): Promise<T | null> {
    const snapshot = await getDoc(doc(this.collectionRef, id));
    return snapshot.exists() ? snapshot.data() : null;
  }

  async list(...constraints: QueryConstraint[]): Promise<T[]> {
    const snapshot = await getDocs(query(this.collectionRef, ...constraints));
    return snapshot.docs.map((docSnap) => docSnap.data());
  }

  async count(...constraints: QueryConstraint[]): Promise<number> {
    const snapshot = await getCountFromServer(query(this.collectionRef, ...constraints));
    return snapshot.data().count;
  }

  /** Pre-generates the document id client-side (no network round-trip) so create is a single write. */
  async create(data: Omit<T, 'id'>, id?: string): Promise<string> {
    const ref = id ? doc(this.collectionRef, id) : doc(this.collectionRef);
    await setDoc(ref, { ...data, id: ref.id } as unknown as T);
    return ref.id;
  }

  /**
   * Note on discriminated-union T (e.g. UserProfile): TypeScript's
   * `Partial<A | B>` doesn't enforce that the fields you pass belong to one
   * consistent variant — it'll happily typecheck a mix of A-only and
   * B-only fields together. Callers are responsible for only passing
   * fields that make sense for the specific document being updated (e.g.
   * `userRepository.update(uid, { isAvailable: true })` only for a known
   * delivery_partner doc). Where that matters more than convenience, add a
   * narrower, precisely-typed method on the feature's own repository
   * instead of reaching for this generic one.
   */
  async update(id: string, data: Partial<T>): Promise<void> {
    await updateDoc(doc(this.collectionRef, id), data as UpdateData<T>);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.collectionRef, id));
  }

  subscribeToDoc(id: string, onNext: (data: T | null) => void, onError?: (error: Error) => void): Unsubscribe {
    return onSnapshot(
      doc(this.collectionRef, id),
      (snapshot) => onNext(snapshot.exists() ? snapshot.data() : null),
      onError,
    );
  }

  subscribeToList(
    onNext: (data: T[]) => void,
    onError: ((error: Error) => void) | undefined,
    ...constraints: QueryConstraint[]
  ): Unsubscribe {
    return onSnapshot(
      query(this.collectionRef, ...constraints),
      (snapshot) => onNext(snapshot.docs.map((docSnap) => docSnap.data())),
      onError,
    );
  }
}
