/**
 * scripts/migrate-user-address-ids.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Migration Analysis & Preparation Tool: Root User Address IDs
 *
 * Requirements:
 * - Default mode is STRICT DRY-RUN ONLY.
 * - Reads existing user documents from a supplied local Firestore export JSON file
 *   or an explicitly provided test fixture.
 * - Derives `addressIds` from existing `addresses[].id`.
 * - Compares the derived IDs with existing `addressIds`, if present.
 * - Identifies:
 *     - Missing IDs (address entry without an id)
 *     - Duplicate IDs in addresses
 *     - Malformed address entries
 *     - Inconsistencies with mirrored address documents where local data is available
 * - Reports:
 *     - Total users inspected
 *     - Users already correct
 *     - Users that can be safely migrated
 *     - Users requiring manual review
 *     - Exact planned document updates
 * - DOES NOT connect to production.
 * - DOES NOT write to Firestore or mutate data.
 * - DOES NOT invent IDs or delete addresses/mirrors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RawAddress {
  id?: string;
  label?: string;
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  isDefault?: boolean;
  [key: string]: any;
}

export interface UserDocRaw {
  id: string;
  role?: string;
  addresses?: RawAddress[];
  addressIds?: string[];
  subcollectionAddresses?: Record<string, RawAddress>; // If export includes subcollection
  [key: string]: any;
}

export interface UserMigrationAssessment {
  userId: string;
  role: string;
  status: 'ALREADY_CORRECT' | 'CAN_MIGRATE' | 'REQUIRES_MANUAL_REVIEW';
  issues: string[];
  existingAddressCount: number;
  calculatedAddressIds: string[];
  plannedUpdate?: {
    addressIds: string[];
    mirrorsToCreate?: Array<{ addressId: string; address: RawAddress }>;
  };
}

export interface UserMigrationReport {
  totalInspected: number;
  customerCount: number;
  alreadyCorrectCount: number;
  safelyMigratableCount: number;
  requiresManualReviewCount: number;
  assessments: UserMigrationAssessment[];
}

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

export function inspectUserProfiles(users: UserDocRaw[]): UserMigrationReport {
  const assessments: UserMigrationAssessment[] = [];

  for (const user of users) {
    const issues: string[] = [];
    const userId = user.id || 'UNKNOWN_UID';
    const role = user.role || 'unknown';

    // Only customers are required to have addressIds
    if (role !== 'customer') {
      assessments.push({
        userId,
        role,
        status: 'ALREADY_CORRECT',
        issues: [],
        existingAddressCount: 0,
        calculatedAddressIds: [],
      });
      continue;
    }

    const addresses = user.addresses || [];
    const derivedIds: string[] = [];

    if (!Array.isArray(addresses)) {
      issues.push('Field `addresses` is not an array');
    } else {
      const seenIds = new Set<string>();

      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        if (!addr || typeof addr !== 'object') {
          issues.push(`addresses[${i}] is not a valid object`);
          continue;
        }

        if (!addr.id || typeof addr.id !== 'string' || addr.id.trim().length === 0) {
          issues.push(`addresses[${i}] is missing a valid 'id' property`);
          continue;
        }

        if (!addr.line1 || typeof addr.line1 !== 'string') {
          issues.push(`addresses[${i}] ("${addr.id}") is missing required 'line1'`);
        }

        if (!addr.city || typeof addr.city !== 'string') {
          issues.push(`addresses[${i}] ("${addr.id}") is missing required 'city'`);
        }

        if (seenIds.has(addr.id)) {
          issues.push(`Duplicate address id found in addresses: "${addr.id}"`);
        } else {
          seenIds.add(addr.id);
          derivedIds.push(addr.id);
        }
      }

      // Check subcollection mirror consistency if available in export
      if (user.subcollectionAddresses) {
        const subcolKeys = Object.keys(user.subcollectionAddresses);
        for (const id of derivedIds) {
          if (!user.subcollectionAddresses[id]) {
            issues.push(`Address ID "${id}" in root addresses[] is missing from subcollection mirror`);
          }
        }
        for (const subId of subcolKeys) {
          if (!seenIds.has(subId)) {
            issues.push(`Subcollection mirror document "${subId}" is not present in root addresses[] array`);
          }
        }
      } else if (derivedIds.length > 0) {
        issues.push(`Subcollection mirror addresses export is absent; cannot verify address mirrors for ${derivedIds.length} address(es)`);
      }
    }

    const hasCriticalIssues = issues.length > 0;
    const existingIds = user.addressIds;
    const isIdsMatch = Array.isArray(existingIds) && arraysEqual(existingIds, derivedIds);

    let status: UserMigrationAssessment['status'];
    let plannedUpdate: UserMigrationAssessment['plannedUpdate'] | undefined;

    if (hasCriticalIssues) {
      status = 'REQUIRES_MANUAL_REVIEW';
    } else if (isIdsMatch) {
      status = 'ALREADY_CORRECT';
    } else {
      status = 'CAN_MIGRATE';
      plannedUpdate = {
        addressIds: derivedIds,
        mirrorsToCreate: [],
      };
    }

    assessments.push({
      userId,
      role,
      status,
      issues,
      existingAddressCount: Array.isArray(addresses) ? addresses.length : 0,
      calculatedAddressIds: derivedIds,
      plannedUpdate,
    });
  }

  const customerAssessments = assessments.filter((a) => a.role === 'customer');
  const alreadyCorrectCount = customerAssessments.filter((a) => a.status === 'ALREADY_CORRECT').length;
  const safelyMigratableCount = customerAssessments.filter((a) => a.status === 'CAN_MIGRATE').length;
  const requiresManualReviewCount = customerAssessments.filter((a) => a.status === 'REQUIRES_MANUAL_REVIEW').length;

  return {
    totalInspected: assessments.length,
    customerCount: customerAssessments.length,
    alreadyCorrectCount,
    safelyMigratableCount,
    requiresManualReviewCount,
    assessments,
  };
}

export function printUserReport(report: UserMigrationReport): void {
  console.log('\n============================================================');
  console.log('   ROOT USER ADDRESS IDS MIGRATION — DRY-RUN AUDIT REPORT   ');
  console.log('============================================================\n');
  console.log(`Total profiles inspected:     ${report.totalInspected}`);
  console.log(`Customer profiles:            ${report.customerCount}`);
  console.log(`Profiles already correct:     ${report.alreadyCorrectCount}`);
  console.log(`Profiles that can be migrated:${report.safelyMigratableCount}`);
  console.log(`Profiles requiring manual rev:${report.requiresManualReviewCount}`);
  console.log('------------------------------------------------------------\n');

  for (const a of report.assessments.filter((x) => x.role === 'customer')) {
    console.log(`[${a.status}] Customer UID: ${a.userId} (${a.existingAddressCount} addresses)`);
    if (a.issues.length > 0) {
      console.log('  ⚠️  Issues:');
      for (const iss of a.issues) {
        console.log(`     - ${iss}`);
      }
    }
    if (a.plannedUpdate) {
      console.log('  📝 Planned update:');
      console.log(`     addressIds: ${JSON.stringify(a.plannedUpdate.addressIds)}`);
    }
    console.log('');
  }
}

// CLI entry point
export function runUserAddressCli(): void {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => a.startsWith('--input='));

  if (!inputArg) {
    console.log('ℹ️  No --input=<path> file provided. Running with sample test fixtures.');
    console.log('   To analyze exported data, run:');
    console.log('   npx tsx scripts/migrate-user-address-ids.ts --input=./users_export.json\n');

    const sampleUsers: UserDocRaw[] = [
      {
        id: 'cust-legacy-no-address-ids',
        role: 'customer',
        addresses: [
          { id: 'addr-home', line1: '123 Main St', city: 'Mysuru', state: 'KA' },
          { id: 'addr-work', line1: '456 Tech Park', city: 'Mysuru', state: 'KA' },
        ],
      },
      {
        id: 'cust-already-synced',
        role: 'customer',
        addresses: [{ id: 'addr-1', line1: '789 High St', city: 'Mysuru', state: 'KA' }],
        addressIds: ['addr-1'],
      },
      {
        id: 'cust-malformed-address',
        role: 'customer',
        addresses: [
          { line1: 'Missing ID St', city: 'Mysuru' } as any,
          { id: 'dup-1', line1: 'First', city: 'Mysuru' },
          { id: 'dup-1', line1: 'Duplicate ID', city: 'Mysuru' },
        ],
      },
      {
        id: 'staff-kitchen-user',
        role: 'kitchen',
      },
    ];

    const report = inspectUserProfiles(sampleUsers);
    printUserReport(report);
    console.log('Notice: Production customer document counts cannot be established locally');
    console.log('without an authorized Firestore export. Never execute migrations against production.\n');
  } else {
    const filePath = path.resolve(inputArg.split('=')[1]);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const users: UserDocRaw[] = Array.isArray(rawData) ? rawData : rawData.documents || [];
    const report = inspectUserProfiles(users);
    printUserReport(report);
  }
}

runUserAddressCli();
