import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getApps, initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";

export const CANONICAL_BACKUP_COLLECTIONS = [
  "users",
  "mealPlans",
  "dailyMenus",
  "kitchens",
  "deliveryZones",
  "subscriptions",
  "orders",
  "payments",
  "settings",
] as const;

export type CanonicalBackupCollection = (typeof CANONICAL_BACKUP_COLLECTIONS)[number];

export interface ExportDatabaseBackupResult {
  success: boolean;
  destination: string;
  timestamp: string;
  collections: Record<string, number>;
  totalDocuments: number;
  sizeBytes: number;
  durationMs: number;
}

const getAdminApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      projectId:
        process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test",
    });
  }
  return getApps()[0];
};

/**
 * Formats a deterministic timestamp for database backups in Asia/Kolkata timezone:
 * YYYY-MM-DD_H-M-S (matching client reference convention)
 */
export function formatBackupTimestamp(
  date: Date = new Date(),
  timezone: string = "Asia/Kolkata",
): string {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  // Use parts in Asia/Kolkata to guarantee exact timezone hours, minutes, and seconds
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "0";
  const second = parts.find((p) => p.type === "second")?.value ?? "0";

  return `${dateStr}_${hour}-${minute}-${second}`;
}

/**
 * Validates timestamp override to prevent path traversal or invalid filename characters.
 */
export function validateTimestampOverride(override: string): void {
  if (!override || typeof override !== "string") {
    throw new Error("Invalid timestampOverride: must be a non-empty string");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(override)) {
    throw new Error(
      `Invalid timestampOverride "${override}": only alphanumeric characters, dashes, and underscores are allowed (no path separators or traversal)`,
    );
  }
}

export class BackendBackupService {
  getDb() {
    return getFirestore(getAdminApp());
  }

  getStorageBucket() {
    const app = getAdminApp();
    const projectId =
      process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test";
    const bucketName =
      process.env.STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      `${projectId}.appspot.com`;

    return getStorage(app).bucket(bucketName);
  }

  /**
   * Scans the 9 canonical Firestore collections, serializes to JSON,
   * and saves to Cloud Storage at backups/firestore_backup_${timestamp}.json.
   *
   * Pure server-authoritative implementation using Firebase Admin SDK.
   */
  async exportDatabaseBackup(
    timestampOverride?: string,
  ): Promise<ExportDatabaseBackupResult> {
    const startTime = Date.now();

    if (timestampOverride !== undefined) {
      validateTimestampOverride(timestampOverride);
    }

    const timestamp = timestampOverride || formatBackupTimestamp();
    const destination = `backups/firestore_backup_${timestamp}.json`;

    logger.info(`[backupService] Starting database backup targeting ${destination}...`);

    const backupData: Record<string, Array<{ id: string; [key: string]: any }>> = {};
    const collectionCounts: Record<string, number> = {};
    let totalDocuments = 0;

    const db = this.getDb();

    // 1. Sequential scan of all canonical collections
    // Sequential execution preserves predictability and prevents memory spikes in 256MiB runtime.
    for (const coll of CANONICAL_BACKUP_COLLECTIONS) {
      try {
        logger.info(`[backupService] Scanning collection: ${coll}...`);
        const snap = await db.collection(coll).get();

        const docs = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        backupData[coll] = docs;
        collectionCounts[coll] = docs.length;
        totalDocuments += docs.length;

        logger.info(`[backupService] Collection ${coll} scanned: ${docs.length} documents.`);
      } catch (err) {
        logger.error(
          `[backupService] Failed during scan of collection ${coll}. Backup aborted to prevent partial export.`,
          err,
        );
        throw err;
      }
    }

    // 2. Complete serialization to JSON
    // Guaranteed to only happen if ALL collections were read successfully.
    let jsonString: string;
    try {
      jsonString = JSON.stringify(backupData);
    } catch (err) {
      logger.error("[backupService] JSON serialization of backup payload failed:", err);
      throw err;
    }

    const sizeBytes = Buffer.byteLength(jsonString, "utf8");

    // 3. Upload to Cloud Storage using Admin SDK
    try {
      logger.info(
        `[backupService] Uploading ${sizeBytes} bytes across ${totalDocuments} documents to ${destination}...`,
      );

      const bucket = this.getStorageBucket();
      const file = bucket.file(destination);

      await file.save(jsonString, {
        contentType: "application/json",
        resumable: false, // direct upload for small-to-medium size; prevents multipart emulator quirks
        metadata: {
          contentType: "application/json",
          metadata: {
            backupType: "weekly",
            timestamp,
            totalDocuments: totalDocuments.toString(),
            sizeBytes: sizeBytes.toString(),
          },
        },
      });

      const durationMs = Date.now() - startTime;
      logger.info(
        `[backupService] Successfully uploaded backup to ${destination} in ${durationMs}ms (${sizeBytes} bytes, ${totalDocuments} documents).`,
      );

      return {
        success: true,
        destination,
        timestamp,
        collections: collectionCounts,
        totalDocuments,
        sizeBytes,
        durationMs,
      };
    } catch (err) {
      logger.error(
        `[backupService] Failed to upload database backup to storage at ${destination}:`,
        err,
      );
      throw err;
    }
  }
}

export const backendBackupService = new BackendBackupService();
