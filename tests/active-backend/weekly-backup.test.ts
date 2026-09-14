process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-test";

import { vi, describe, it, expect, afterEach, beforeAll } from "vitest";
import { initTestApp, getFirestore, getStorage, GeoPoint } from "../../functions/src/test-init";

initTestApp();
const db = getFirestore();

import {
  backendBackupService,
  CANONICAL_BACKUP_COLLECTIONS,
  validateTimestampOverride,
  formatBackupTimestamp,
} from "../../functions/src/services/backupService";
import { runWeeklyBackup } from "../../functions/src/scheduled/weeklyBackup";

describe("trusted backend weekly backup", () => {
  const testRunId = `test_bkp_${Date.now()}`;
  const bucketName = "demo-test.appspot.com";
  const storageBucket = getStorage().bucket(bucketName);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Orchestrator & Execution Lifecycle", () => {
    it("runWeeklyBackup() orchestrates backup, logs stage, and returns structured metadata", async () => {
      const timestamp = `${testRunId}_orch`;
      const result = await runWeeklyBackup(timestamp);

      expect(result.success).toBe(true);
      expect(result.destination).toBe(`backups/firestore_backup_${timestamp}.json`);
      expect(result.timestamp).toBe(timestamp);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.totalDocuments).toBeGreaterThanOrEqual(0);
      expect(typeof result.sizeBytes).toBe("number");

      // Verify the storage object actually exists and can be downloaded
      const file = storageBucket.file(result.destination);
      const [exists] = await file.exists();
      expect(exists).toBe(true);

      const [contents] = await file.download();
      const parsed = JSON.parse(contents.toString("utf8"));
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });

    it("propagates unrecoverable errors if service fails (never swallows)", async () => {
      vi.spyOn(backendBackupService, "exportDatabaseBackup").mockRejectedValueOnce(
        new Error("Disk/Network Failure on Cloud Storage"),
      );

      await expect(runWeeklyBackup(`${testRunId}_err`)).rejects.toThrow(
        "Disk/Network Failure on Cloud Storage",
      );
    });
  });

  describe("2. Canonical Collection Coverage & Document Content Parity", () => {
    it("verifies all 9 canonical collections are queried and present in backup payload", async () => {
      const timestamp = `${testRunId}_canonical`;

      // Seed a representative document in every single one of the 9 canonical collections
      for (const coll of CANONICAL_BACKUP_COLLECTIONS) {
        const docId = `${testRunId}_${coll}_doc`;
        await db.collection(coll).doc(docId).set({
          source: "weekly_backup_test",
          collName: coll,
          numericVal: 100,
          booleanVal: true,
          nullVal: null,
          stringVal: `text_in_${coll}`,
          tags: ["alpha", "beta"],
          metadata: { subKey: "subVal", active: true },
        });
      }

      const result = await backendBackupService.exportDatabaseBackup(timestamp);
      expect(result.success).toBe(true);

      const file = storageBucket.file(result.destination);
      const [contents] = await file.download();
      const backupJson = JSON.parse(contents.toString("utf8"));

      // 1. Verify every collection exists in the root JSON
      for (const coll of CANONICAL_BACKUP_COLLECTIONS) {
        expect(backupJson).toHaveProperty(coll);
        expect(Array.isArray(backupJson[coll])).toBe(true);

        const found = backupJson[coll].find((d: any) => d.id === `${testRunId}_${coll}_doc`);
        expect(found).toBeDefined();
        expect(found.collName).toBe(coll);
        expect(found.numericVal).toBe(100);
        expect(found.booleanVal).toBe(true);
        expect(found.nullVal).toBeNull();
        expect(found.stringVal).toBe(`text_in_${coll}`);
        expect(found.tags).toEqual(["alpha", "beta"]);
        expect(found.metadata).toEqual({ subKey: "subVal", active: true });
      }
    });

    it("verifies Firestore native types: Timestamp, GeoPoint, nested arrays, and objects", async () => {
      const timestamp = `${testRunId}_types`;
      const docId = `${testRunId}_rich_doc`;
      const dateNow = new Date("2026-09-14T06:00:00.000Z");

      await db.collection("kitchens").doc(docId).set({
        kitchenName: "Central Kitchen",
        openedAt: dateNow,
        location: new GeoPoint(12.3051, 76.6551),
        operationalStaff: ["chef_1", "chef_2"],
        config: {
          maxCapacity: 500,
          verified: true,
          notes: null,
        },
      });

      await backendBackupService.exportDatabaseBackup(timestamp);

      const file = storageBucket.file(`backups/firestore_backup_${timestamp}.json`);
      const [contents] = await file.download();
      const backupJson = JSON.parse(contents.toString("utf8"));

      const doc = backupJson.kitchens.find((d: any) => d.id === docId);
      expect(doc).toBeDefined();
      expect(doc.kitchenName).toBe("Central Kitchen");

      // Timestamp serialization: Firestore Admin SDK serializes Timestamp with _seconds & _nanoseconds
      expect(doc.openedAt).toBeDefined();
      expect(typeof doc.openedAt._seconds).toBe("number");
      expect(typeof doc.openedAt._nanoseconds).toBe("number");

      // GeoPoint serialization
      expect(doc.location).toBeDefined();
      expect(doc.location._latitude).toBeCloseTo(12.3051);
      expect(doc.location._longitude).toBeCloseTo(76.6551);

      // Complex nested structures
      expect(doc.operationalStaff).toEqual(["chef_1", "chef_2"]);
      expect(doc.config.maxCapacity).toBe(500);
      expect(doc.config.verified).toBe(true);
      expect(doc.config.notes).toBeNull();
    });

    it("handles multiple documents per collection without truncation or duplicates", async () => {
      const timestamp = `${testRunId}_multiple`;
      const multiPrefix = `${testRunId}_multi`;

      // Seed 6 distinct documents in dailyMenus
      const expectedIds: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const id = `${multiPrefix}_${i}`;
        expectedIds.push(id);
        await db.collection("dailyMenus").doc(id).set({
          dayIndex: i,
          menuName: `Menu Variation ${i}`,
        });
      }

      await backendBackupService.exportDatabaseBackup(timestamp);

      const file = storageBucket.file(`backups/firestore_backup_${timestamp}.json`);
      const [contents] = await file.download();
      const backupJson = JSON.parse(contents.toString("utf8"));

      const matchedIds = backupJson.dailyMenus
        .filter((d: any) => d.id.startsWith(multiPrefix))
        .map((d: any) => d.id);

      expect(matchedIds.sort()).toEqual(expectedIds.sort());
    });
  });

  describe("3. Retry Safety & Atomic Upload", () => {
    it("repeated executions with same timestamp write complete valid JSON without side-effects", async () => {
      const deterministicTimestamp = `${testRunId}_retry_safe`;

      // 1. First execution
      const result1 = await backendBackupService.exportDatabaseBackup(deterministicTimestamp);
      expect(result1.success).toBe(true);

      const file1 = storageBucket.file(result1.destination);
      const [contents1] = await file1.download();
      const json1 = JSON.parse(contents1.toString("utf8"));

      // 2. Second execution (retry)
      const result2 = await backendBackupService.exportDatabaseBackup(deterministicTimestamp);
      expect(result2.success).toBe(true);
      expect(result2.destination).toBe(result1.destination);

      const file2 = storageBucket.file(result2.destination);
      const [contents2] = await file2.download();
      const json2 = JSON.parse(contents2.toString("utf8"));

      // The content of retry must be identical and valid
      expect(json2).toEqual(json1);
    });

    it("aborts and prevents partial upload if a collection read fails", async () => {
      const timestamp = `${testRunId}_abort_test`;
      const destination = `backups/firestore_backup_${timestamp}.json`;

      // Mock db.collection to throw when accessing "payments"
      const originalCollection = db.collection.bind(db);
      vi.spyOn(db, "collection").mockImplementation((name: string) => {
        if (name === "payments") {
          throw new Error("Simulated Firestore read error on payments");
        }
        return originalCollection(name);
      });

      await expect(
        backendBackupService.exportDatabaseBackup(timestamp),
      ).rejects.toThrow("Simulated Firestore read error on payments");

      // Verify that no partial file was uploaded to Cloud Storage
      const file = storageBucket.file(destination);
      const [exists] = await file.exists();
      expect(exists).toBe(false);
    });

    it("propagates error cleanly if storage save fails", async () => {
      const timestamp = `${testRunId}_save_fail`;

      vi.spyOn(backendBackupService, "getStorageBucket").mockReturnValue({
        file: () => ({
          save: vi.fn().mockRejectedValue(new Error("Storage quota exceeded or network drop")),
        }),
      } as any);

      await expect(
        backendBackupService.exportDatabaseBackup(timestamp),
      ).rejects.toThrow("Storage quota exceeded or network drop");
    });
  });

  describe("4. Timestamp Validation & Formatting", () => {
    it("formatBackupTimestamp formats YYYY-MM-DD_H-M-S in Asia/Kolkata timezone", () => {
      const fixedDate = new Date("2026-09-20T00:30:15.000Z"); // 06:00:15 in Asia/Kolkata (+05:30)
      const formatted = formatBackupTimestamp(fixedDate, "Asia/Kolkata");
      expect(formatted).toBe("2026-09-20_06-00-15");
    });

    it("validateTimestampOverride allows safe alphanumeric, dashes, and underscores", () => {
      expect(() => validateTimestampOverride("2026-09-20_00-00-00")).not.toThrow();
      expect(() => validateTimestampOverride("backup_run_12345")).not.toThrow();
      expect(() => validateTimestampOverride("weekly-2026")).not.toThrow();
    });

    it("validateTimestampOverride blocks path traversal, slashes, and illegal characters", () => {
      expect(() => validateTimestampOverride("../traversal")).toThrow(/Invalid timestampOverride/);
      expect(() => validateTimestampOverride("folder/nested")).toThrow(/Invalid timestampOverride/);
      expect(() => validateTimestampOverride("back\\slash")).toThrow(/Invalid timestampOverride/);
      expect(() => validateTimestampOverride("")).toThrow(/Invalid timestampOverride/);
      expect(() => validateTimestampOverride("evil;rm -rf")).toThrow(/Invalid timestampOverride/);
    });
  });

  describe("5. Empty Database Handling & Format Drift Parity", () => {
    it("handles an empty database gracefully, producing valid JSON with all 9 collections as empty arrays", async () => {
      const timestamp = `${testRunId}_empty_db`;

      // Mock db.collection to return empty docs for all collections
      const mockDb = {
        collection: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: [] }),
        }),
      };
      vi.spyOn(backendBackupService, "getDb").mockReturnValue(mockDb as any);

      const result = await backendBackupService.exportDatabaseBackup(timestamp);
      expect(result.success).toBe(true);
      expect(result.totalDocuments).toBe(0);

      for (const coll of CANONICAL_BACKUP_COLLECTIONS) {
        expect(result.collections[coll]).toBe(0);
      }

      const file = storageBucket.file(result.destination);
      const [contents] = await file.download();
      const backupJson = JSON.parse(contents.toString("utf8"));

      for (const coll of CANONICAL_BACKUP_COLLECTIONS) {
        expect(backupJson).toHaveProperty(coll);
        expect(backupJson[coll]).toEqual([]);
      }
    });

    it("preserves exact client schema contract: root collections with array of { id, ...data }", async () => {
      const timestamp = `${testRunId}_parity_check`;
      const docId = `${testRunId}_parity_doc`;

      await db.collection("settings").doc(docId).set({
        featureFlags: { enableAutoBilling: true, betaFeatures: ["v2", "dark_mode"] },
        cutoffHour: 21,
        maintenanceMessage: null,
      });

      const result = await backendBackupService.exportDatabaseBackup(timestamp);
      const file = storageBucket.file(result.destination);
      const [contents] = await file.download();
      const backupJson = JSON.parse(contents.toString("utf8"));

      const settingDoc = backupJson.settings.find((d: any) => d.id === docId);
      expect(settingDoc).toBeDefined();
      expect(settingDoc.id).toBe(docId);
      expect(settingDoc.featureFlags.enableAutoBilling).toBe(true);
      expect(settingDoc.featureFlags.betaFeatures).toEqual(["v2", "dark_mode"]);
      expect(settingDoc.cutoffHour).toBe(21);
      expect(settingDoc.maintenanceMessage).toBeNull();
    });
  });
});
