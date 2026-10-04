import { db } from "@/shared/lib/firebase";
import type { UserProfile } from "@/shared/types";
import type { Role } from "@/shared/constants/roles";
import { BaseRepository, createConverter } from "./BaseRepository";

import {
  collection,
  query,
  where,
  limit,
  startAfter,
  getDocs,
  doc,
  runTransaction,
  documentId,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

class UserRepository extends BaseRepository<UserProfile> {
  constructor() {
    super(db, "users", createConverter<UserProfile>());
  }

  /**
   * Fetches multiple user profiles by ID in batches of up to 30 (Firestore 'in' query limit).
   */
  async getByIds(ids: string[]): Promise<UserProfile[]> {
    if (!ids || ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const CHUNK_SIZE = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map((chunk) => this.list(where(documentId(), "in", chunk))),
    );

    return results.flat();
  }

  async getCustomersPaginated(
    pageSize: number,
    lastDocSnap?: QueryDocumentSnapshot<UserProfile>,
  ): Promise<{
    customers: UserProfile[];
    lastDoc: QueryDocumentSnapshot<UserProfile> | null;
  }> {
    const constraints: QueryConstraint[] = [
      where("role", "==", "customer"),
      limit(pageSize),
    ];

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const converter = createConverter<UserProfile>();
    const colRef = collection(db, "users").withConverter(converter);
    const snapshot = await getDocs(query(colRef, ...constraints));

    const customers = snapshot.docs.map((d) => d.data());
    return {
      customers,
      lastDoc:
        snapshot.docs.length === pageSize
          ? (snapshot.docs[
              snapshot.docs.length - 1
            ] as QueryDocumentSnapshot<UserProfile>)
          : null,
    };
  }

  /**
   * Allocates the next sequential human-readable display ID via an atomic Firestore transaction.
   *
   * Formats:
   *   - Customer: MP-{PaddedCount} (e.g. MP-001, MP-002, MP-003). Continuous sequential numbering.
   *   - Staff roles (admin, kitchen, delivery_partner, accounts):
   *     ADMIN-{1001+}, KTCH-{1001+}, DLVY-{1001+}, ACCT-{1001+}
   */
  async generateNextDisplayId(role: Role, _fullName?: string): Promise<string> {
    const counterRef = doc(db, "settings", "userCounters");

    if (role === "customer") {
      const maxRetries = 5;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let count = 0;

            if (counterDoc.exists()) {
              const data = counterDoc.data();
              if (
                "customer" in data &&
                typeof data["customer"] === "number" &&
                Number.isInteger(data["customer"]) &&
                data["customer"] >= 0
              ) {
                count = data["customer"];
              }
            }

            const newCount = count + 1;
            transaction.set(counterRef, { customer: newCount }, { merge: true });

            const paddedCount = newCount.toString().padStart(3, "0");
            return `MP-${paddedCount}`;
          });
        } catch (err: any) {
          if (attempt < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, attempt * 60 + Math.random() * 40),
            );
            continue;
          }
          throw err;
        }
      }
      throw new Error("Failed to generate customer display ID after retries");
    }

    const prefixMap: Record<Role, string> = {
      customer: "MP",
      admin: "ADMIN",
      kitchen: "KTCH",
      delivery_partner: "DLVY",
      accounts: "ACCT",
    };
    const prefix = prefixMap[role] || "USER";

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let count = 1000;

          if (counterDoc.exists()) {
            const data = counterDoc.data();
            if (
              role in data &&
              typeof data[role] === "number" &&
              Number.isInteger(data[role]) &&
              data[role] >= 0
            ) {
              count = data[role];
            }
          }

          const newCount = count + 1;
          transaction.set(counterRef, { [role]: newCount }, { merge: true });

          return `${prefix}-${newCount}`;
        });
      } catch (err: any) {
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, attempt * 60 + Math.random() * 40),
          );
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to generate ${role} display ID after retries`);
  }

  /**
   * Find a user by displayId, phone, or email.
   */
  async getByDisplayIdOrPhone(identifier: string): Promise<UserProfile | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    // Try by displayId
    const byDisplay = await this.list(where("displayId", "==", trimmed), limit(1));
    if (byDisplay.length > 0) return byDisplay[0];

    // Try by phone
    const byPhone = await this.list(where("phone", "==", trimmed), limit(1));
    if (byPhone.length > 0) return byPhone[0];

    // Try by email
    const byEmail = await this.list(where("email", "==", trimmed.toLowerCase()), limit(1));
    if (byEmail.length > 0) return byEmail[0];

    return null;
  }
}

/** Singleton — one Firestore collection reference reused across the whole app. */
export const userRepository = new UserRepository();
