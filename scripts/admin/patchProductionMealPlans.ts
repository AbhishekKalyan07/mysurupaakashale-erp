/**
 * scripts/admin/patchProductionMealPlans.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Targeted Production Meal Plan Field Correction Tool
 *
 * Requirements:
 * - Query collection 'mealPlans':
 *     - Basic Plan:   name == "Basic Plan" && tier == "basic"
 *     - Regular Plan: name == "Regular Plan" && tier == "regular"
 * - Does not assume hardcoded document IDs (captures actual production IDs).
 * - Verifies exactly one document matches each plan (aborts if 0 or >1).
 * - Verifies mealSlots contains the expected option IDs before preparing updates.
 * - Basic Plan target fields:
 *     - optionIds: ["basic-lunch-1", "basic-lunch-2", "basic-lunch-3", "basic-dinner-1", "basic-dinner-2", "basic-dinner-3"]
 *     - lunchOptionIds: ["basic-lunch-1", "basic-lunch-2", "basic-lunch-3"]
 *     - dinnerOptionIds: ["basic-dinner-1", "basic-dinner-2", "basic-dinner-3"]
 * - Regular Plan target fields (corrects erroneous Basic IDs in Regular plan):
 *     - optionIds: ["regular-lunch-1", "regular-lunch-2", "regular-dinner-1", "regular-dinner-2"]
 *     - lunchOptionIds: ["regular-lunch-1", "regular-lunch-2"]
 *     - dinnerOptionIds: ["regular-dinner-1", "regular-dinner-2"]
 * - Safety:
 *     - Defaults to strict DRY-RUN mode.
 *     - Does NOT recreate documents or modify pricing, slots, timestamps, or descriptions.
 *     - Targeted update of only the 3 fields per document.
 *     - Post-write verification: reads back both documents and verifies array elements.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TargetPlanConfig {
  name: string;
  tier: string;
  targetOptionIds: string[];
  targetLunchOptionIds: string[];
  targetDinnerOptionIds: string[];
}

export const TARGET_PLANS: Record<string, TargetPlanConfig> = {
  basic: {
    name: 'Basic Plan',
    tier: 'basic',
    targetOptionIds: [
      'basic-lunch-1',
      'basic-lunch-2',
      'basic-lunch-3',
      'basic-dinner-1',
      'basic-dinner-2',
      'basic-dinner-3',
    ],
    targetLunchOptionIds: [
      'basic-lunch-1',
      'basic-lunch-2',
      'basic-lunch-3',
    ],
    targetDinnerOptionIds: [
      'basic-dinner-1',
      'basic-dinner-2',
      'basic-dinner-3',
    ],
  },
  regular: {
    name: 'Regular Plan',
    tier: 'regular',
    targetOptionIds: [
      'regular-lunch-1',
      'regular-lunch-2',
      'regular-dinner-1',
      'regular-dinner-2',
    ],
    targetLunchOptionIds: [
      'regular-lunch-1',
      'regular-lunch-2',
    ],
    targetDinnerOptionIds: [
      'regular-dinner-1',
      'regular-dinner-2',
    ],
  },
};

export interface PlanDocData {
  id: string;
  name?: string;
  tier?: string;
  pricePerDay?: number;
  mealSlots?: Array<{
    mealType?: string;
    isCustomerSelectable?: boolean;
    options?: Array<{ id?: string; label?: string; [key: string]: any }>;
  }>;
  optionIds?: string[];
  lunchOptionIds?: string[];
  dinnerOptionIds?: string[];
  [key: string]: any;
}

export interface PlanUpdateDiff {
  planKey: 'basic' | 'regular';
  docId: string;
  planName: string;
  tier: string;
  mealSlotsValidated: boolean;
  discoveredSlotOptionIds: {
    lunch: string[];
    dinner: string[];
  };
  before: {
    optionIds: string[];
    lunchOptionIds: string[];
    dinnerOptionIds: string[];
  };
  after: {
    optionIds: string[];
    lunchOptionIds: string[];
    dinnerOptionIds: string[];
  };
  isModified: boolean;
}

export interface DryRunAuditResult {
  canProceed: boolean;
  errors: string[];
  diffs: PlanUpdateDiff[];
}

export function extractSlotOptionIds(doc: PlanDocData): { lunch: string[]; dinner: string[] } {
  const lunch: string[] = [];
  const dinner: string[] = [];
  const slots = doc.mealSlots || [];

  for (const slot of slots) {
    if (slot.mealType === 'breakfast' || slot.isCustomerSelectable === false) continue;
    const options = slot.options || [];
    for (const opt of options) {
      if (opt.id && opt.isActive !== false && opt.isCustomerSelectable !== false) {
        if (slot.mealType === 'lunch') lunch.push(opt.id);
        if (slot.mealType === 'dinner') dinner.push(opt.id);
      }
    }
  }

  return { lunch, dinner };
}

export function analyzePlans(allPlans: PlanDocData[]): DryRunAuditResult {
  const errors: string[] = [];
  const diffs: PlanUpdateDiff[] = [];

  for (const [key, target] of Object.entries(TARGET_PLANS) as [('basic' | 'regular'), TargetPlanConfig][]) {
    // 1. Locate documents by name and tier
    const matches = allPlans.filter(
      (p) => (p.name || '').trim() === target.name && (p.tier || '').trim() === target.tier
    );

    if (matches.length === 0) {
      errors.push(`ABORT: No document found matching name == "${target.name}" and tier == "${target.tier}".`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(
        `ABORT: Ambiguous match — found ${matches.length} documents matching name == "${target.name}" and tier == "${target.tier}": [${matches.map((m) => m.id).join(', ')}].`
      );
      continue;
    }

    const doc = matches[0];
    const docId = doc.id;

    // 2. Inspect existing mealSlots
    const slotOptions = extractSlotOptionIds(doc);
    const expectedLunch = target.targetLunchOptionIds;
    const expectedDinner = target.targetDinnerOptionIds;

    const lunchMissingInSlots = expectedLunch.filter((id) => !slotOptions.lunch.includes(id));
    const dinnerMissingInSlots = expectedDinner.filter((id) => !slotOptions.dinner.includes(id));

    let mealSlotsValidated = true;
    if (lunchMissingInSlots.length > 0) {
      errors.push(
        `Doc "${docId}" (${target.name}): mealSlots lunch does not contain expected option ID(s): ${JSON.stringify(lunchMissingInSlots)}.`
      );
      mealSlotsValidated = false;
    }
    if (dinnerMissingInSlots.length > 0) {
      errors.push(
        `Doc "${docId}" (${target.name}): mealSlots dinner does not contain expected option ID(s): ${JSON.stringify(dinnerMissingInSlots)}.`
      );
      mealSlotsValidated = false;
    }

    // 3. Prepare diff
    const beforeOptionIds = Array.isArray(doc.optionIds) ? [...doc.optionIds] : [];
    const beforeLunchOptionIds = Array.isArray(doc.lunchOptionIds) ? [...doc.lunchOptionIds] : [];
    const beforeDinnerOptionIds = Array.isArray(doc.dinnerOptionIds) ? [...doc.dinnerOptionIds] : [];

    const isOptionIdsDiff = JSON.stringify(beforeOptionIds) !== JSON.stringify(target.targetOptionIds);
    const isLunchDiff = JSON.stringify(beforeLunchOptionIds) !== JSON.stringify(target.targetLunchOptionIds);
    const isDinnerDiff = JSON.stringify(beforeDinnerOptionIds) !== JSON.stringify(target.targetDinnerOptionIds);

    const isModified = isOptionIdsDiff || isLunchDiff || isDinnerDiff;

    diffs.push({
      planKey: key,
      docId,
      planName: target.name,
      tier: target.tier,
      mealSlotsValidated,
      discoveredSlotOptionIds: slotOptions,
      before: {
        optionIds: beforeOptionIds,
        lunchOptionIds: beforeLunchOptionIds,
        dinnerOptionIds: beforeDinnerOptionIds,
      },
      after: {
        optionIds: target.targetOptionIds,
        lunchOptionIds: target.targetLunchOptionIds,
        dinnerOptionIds: target.targetDinnerOptionIds,
      },
      isModified,
    });
  }

  const canProceed = errors.length === 0 && diffs.length === 2 && diffs.every((d) => d.mealSlotsValidated);

  return {
    canProceed,
    errors,
    diffs,
  };
}

export function printDryRunReport(result: DryRunAuditResult): void {
  console.log('\n======================================================================');
  console.log('       PRODUCTION MEAL PLAN FIELD CORRECTION — DRY-RUN REPORT         ');
  console.log('======================================================================\n');

  if (result.errors.length > 0) {
    console.log('❌ VALIDATION ERRORS / ABORT CONDITIONS:');
    for (const err of result.errors) {
      console.log(`   • ${err}`);
    }
    console.log('\nStatus: BLOCKED FROM EXECUTION.\n');
    return;
  }

  console.log('✅ ALL SAFETY PRE-CONDITIONS SATISFIED.');
  console.log('   - Exactly 1 document matched for Basic Plan and 1 for Regular Plan.');
  console.log('   - Existing mealSlots verified to contain all required option IDs.');
  console.log('   - Targeted update will modify ONLY the 3 designated fields per document.\n');

  for (const diff of result.diffs) {
    console.log('----------------------------------------------------------------------');
    console.log(`PLAN: ${diff.planName} (tier: "${diff.tier}")`);
    console.log(`Document ID: [ ${diff.docId} ]`);
    console.log('----------------------------------------------------------------------');
    console.log(`Discovered Selectable Slots:`);
    console.log(`   Lunch : ${JSON.stringify(diff.discoveredSlotOptionIds.lunch)}`);
    console.log(`   Dinner: ${JSON.stringify(diff.discoveredSlotOptionIds.dinner)}`);
    console.log(`\nChanges:`);

    console.log(`• optionIds:`);
    console.log(`    Before: ${JSON.stringify(diff.before.optionIds)}`);
    console.log(`    After : ${JSON.stringify(diff.after.optionIds)}`);

    console.log(`• lunchOptionIds:`);
    console.log(`    Before: ${JSON.stringify(diff.before.lunchOptionIds)}`);
    console.log(`    After : ${JSON.stringify(diff.after.lunchOptionIds)}`);

    console.log(`• dinnerOptionIds:`);
    console.log(`    Before: ${JSON.stringify(diff.before.dinnerOptionIds)}`);
    console.log(`    After : ${JSON.stringify(diff.after.dinnerOptionIds)}`);
    console.log('');
  }

  console.log('======================================================================');
  console.log('APPROVAL GATE: DRY-RUN ONLY. NO FIRESTORE WRITES COMMITTED.');
  console.log('======================================================================\n');
}

export async function runPatchCli(): Promise<void> {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => a.startsWith('--input='));
  const isApply = args.includes('--apply');
  const isConfirmed = args.includes('--confirm');

  // Case A: Reading from supplied export file
  if (inputArg) {
    const filePath = path.resolve(inputArg.split('=')[1]);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Input file not found: ${filePath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const plans: PlanDocData[] = Array.isArray(raw) ? raw : raw.documents || [];
    const result = analyzePlans(plans);
    printDryRunReport(result);
    return;
  }

  // Case B: Connecting via Firebase Admin SDK
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!credPath && !serviceAccountKey) {
    console.log('\n🚫 PRODUCTION ACCESS UNAVAILABLE IN LOCAL WORKSPACE:');
    console.log('   1. GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    console.log('   2. Local .env.local is configured for demo-test emulator mode (VITE_USE_FIREBASE_EMULATORS=true).');
    console.log('   3. No gcloud application-default credentials exist on this Windows machine.');
    console.log('\nPer safety requirements, Antigravity stops here and does not claim production updates occurred.');
    console.log('\nTo run the live dry-run inspection against production:');
    console.log('   Option 1: Export production mealPlans collection and run:');
    console.log('             npx vite-node scripts/admin/patchProductionMealPlans.ts --input=./mealPlans_prod.json');
    console.log('   Option 2: Provide an authorized service account credential:');
    console.log('             set GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json');
    console.log('             npx vite-node scripts/admin/patchProductionMealPlans.ts --dry-run');
    return;
  }

  // If credentials exist, initialize firebase-admin dynamically
  const { initializeApp, cert, applicationDefault, deleteApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let credential;
  if (credPath) {
    credential = cert(credPath);
  } else if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(
        serviceAccountKey.startsWith('{')
          ? serviceAccountKey
          : Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
      );
      credential = cert(parsed);
    } catch {
      credential = cert(serviceAccountKey);
    }
  } else {
    credential = applicationDefault();
  }

  const app = initializeApp({
    credential,
  }, `prod-meal-plan-patch-${Date.now()}`);

  const resolvedProjectId =
    app.options.projectId ||
    (credential as any)?.projectId ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'unknown';
  console.log(`ℹ️  Resolved Project ID: ${resolvedProjectId}`);

  const db = getFirestore(app);

  try {
    const snapshot = await db.collection('mealPlans').get();
    const plans: PlanDocData[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    const result = analyzePlans(plans);
    printDryRunReport(result);

    if (!result.canProceed) {
      console.error('❌ Cannot proceed due to validation errors.');
      process.exit(1);
    }

    if (!isApply || !isConfirmed) {
      console.log('ℹ️  To apply these targeted updates to production, re-run with explicit approval:');
      console.log('   npx vite-node scripts/admin/patchProductionMealPlans.ts --apply --confirm\n');
      return;
    }

    // Apply targeted updates only after explicit approval gate
    console.log('🚀 EXECUTING TARGETED PRODUCTION DOCUMENT UPDATES...\n');
    const batch = db.batch();
    for (const diff of result.diffs) {
      const docRef = db.collection('mealPlans').doc(diff.docId);
      batch.update(docRef, {
        optionIds: diff.after.optionIds,
        lunchOptionIds: diff.after.lunchOptionIds,
        dinnerOptionIds: diff.after.dinnerOptionIds,
      });
    }
    await batch.commit();

    for (const diff of result.diffs) {
      console.log(`✅ Updated document [${diff.docId}] (${diff.planName}).`);
    }

    // Post-update verification read
    console.log('\n🔍 VERIFYING COMMITTED DOCUMENTS POST-UPDATE...');
    for (const diff of result.diffs) {
      const readSnap = await db.collection('mealPlans').doc(diff.docId).get();
      const data = readSnap.data() || {};

      const optionIdsMatch = JSON.stringify(data.optionIds) === JSON.stringify(diff.after.optionIds);
      const lunchMatch = JSON.stringify(data.lunchOptionIds) === JSON.stringify(diff.after.lunchOptionIds);
      const dinnerMatch = JSON.stringify(data.dinnerOptionIds) === JSON.stringify(diff.after.dinnerOptionIds);

      if (!optionIdsMatch || !lunchMatch || !dinnerMatch) {
        throw new Error(`Verification failed for doc [${diff.docId}]: arrays do not match requested values.`);
      }
      console.log(`✅ Document [${diff.docId}] verified: all array elements match requested target.`);
    }

    console.log('\n🎉 ALL PRODUCTION UPDATES COMPLETED AND VERIFIED SUCCESSFULLY.\n');
  } finally {
    await deleteApp(app);
  }
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('patchProductionMealPlans.ts'));

if (isDirectExecution) {
  runPatchCli().catch((err) => {
    console.error('Fatal error during execution:', err);
    process.exit(1);
  });
}

