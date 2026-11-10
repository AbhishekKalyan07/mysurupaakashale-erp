/**
 * scripts/migrate-meal-plan-option-ids.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Migration Analysis & Preparation Tool: Meal Plan Option IDs
 *
 * Requirements:
 * - Default mode is STRICT DRY-RUN ONLY.
 * - Reads existing meal-plan documents from a supplied local Firestore export JSON file
 *   or an explicitly provided test fixture.
 * - Derives `lunchOptionIds` and `dinnerOptionIds` from actual `mealSlots`.
 * - Identifies plans with missing, malformed, or inconsistent meal-slot data.
 * - Identifies plans whose existing derived ID fields differ from calculated values.
 * - Reports:
 *     - Total plans inspected
 *     - Plans that can be safely migrated
 *     - Plans already correct
 *     - Plans requiring manual review
 *     - Exact planned document updates
 * - DOES NOT connect to production.
 * - DOES NOT write to Firestore.
 * - DOES NOT invent missing option IDs or silently repair inconsistent plans.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MealOptionRaw {
  id?: string;
  label?: string;
  items?: string[];
  description?: string;
  isActive?: boolean;
  isCustomerSelectable?: boolean;
}

export interface MealSlotConfigRaw {
  mealType?: string;
  isCustomerSelectable?: boolean;
  options?: MealOptionRaw[];
}

export interface MealPlanDocRaw {
  id: string;
  name?: string;
  tier?: string;
  pricePerDay?: number;
  mealSlots?: MealSlotConfigRaw[];
  optionIds?: string[];
  lunchOptionIds?: string[];
  dinnerOptionIds?: string[];
  [key: string]: any;
}

export interface PlanMigrationAssessment {
  planId: string;
  planName: string;
  status: 'ALREADY_CORRECT' | 'CAN_MIGRATE' | 'REQUIRES_MANUAL_REVIEW';
  issues: string[];
  calculated: {
    optionIds: string[];
    lunchOptionIds: string[];
    dinnerOptionIds: string[];
  };
  plannedUpdate?: {
    optionIds: string[];
    lunchOptionIds: string[];
    dinnerOptionIds: string[];
  };
}

export interface MealPlanMigrationReport {
  totalInspected: number;
  alreadyCorrectCount: number;
  safelyMigratableCount: number;
  requiresManualReviewCount: number;
  assessments: PlanMigrationAssessment[];
}

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

export function inspectMealPlans(plans: MealPlanDocRaw[]): MealPlanMigrationReport {
  const assessments: PlanMigrationAssessment[] = [];

  for (const plan of plans) {
    const issues: string[] = [];
    const planId = plan.id || 'UNKNOWN_ID';
    const planName = plan.name || 'Unnamed Plan';

    if (!plan.id) {
      issues.push('Missing required document id');
    }

    if (!plan.mealSlots) {
      issues.push('Missing mealSlots array');
    } else if (!Array.isArray(plan.mealSlots)) {
      issues.push('mealSlots is not an array');
    } else if (plan.mealSlots.length === 0) {
      issues.push('mealSlots array is empty');
    }

    const calculatedOptionIds: string[] = [];
    const calculatedLunchOptionIds: string[] = [];
    const calculatedDinnerOptionIds: string[] = [];

    if (Array.isArray(plan.mealSlots)) {
      for (let sIdx = 0; sIdx < plan.mealSlots.length; sIdx++) {
        const slot = plan.mealSlots[sIdx];
        if (!slot || typeof slot !== 'object') {
          issues.push(`mealSlots[${sIdx}] is not an object`);
          continue;
        }

        if (!slot.mealType || !['breakfast', 'lunch', 'dinner'].includes(slot.mealType)) {
          issues.push(`mealSlots[${sIdx}] has invalid or missing mealType: "${slot.mealType}"`);
        }

        if (slot.options !== undefined && !Array.isArray(slot.options)) {
          issues.push(`mealSlots[${sIdx}] options is not an array`);
          continue;
        }

        const options = slot.options || [];
        for (let oIdx = 0; oIdx < options.length; oIdx++) {
          const opt = options[oIdx];
          if (!opt || typeof opt !== 'object') {
            issues.push(`mealSlots[${sIdx}].options[${oIdx}] is not an object`);
            continue;
          }

          if (!opt.id || typeof opt.id !== 'string' || opt.id.trim().length === 0) {
            issues.push(
              `mealSlots[${sIdx}] (${slot.mealType}) option at index ${oIdx} ("${opt.label || 'unlabeled'}") is missing a valid id`
            );
            continue;
          }

          // Breakfast options must never be customer-selectable
          if (slot.mealType === 'breakfast') {
            if (slot.isCustomerSelectable === true || opt.isCustomerSelectable === true) {
              issues.push(
                `Breakfast option "${opt.id}" has invalid selectable flag (breakfast must not be selectable)`
              );
            }
            continue;
          }

          // Check selectable lunch/dinner options
          const isSlotSelectable = slot.isCustomerSelectable !== false;
          const isOptSelectable = opt.isCustomerSelectable !== false && opt.isActive !== false;

          if (isSlotSelectable && isOptSelectable) {
            calculatedOptionIds.push(opt.id);
            if (slot.mealType === 'lunch') {
              calculatedLunchOptionIds.push(opt.id);
            } else if (slot.mealType === 'dinner') {
              calculatedDinnerOptionIds.push(opt.id);
            }
          }
        }
      }
    }

    // Deduplicate calculated IDs
    const uniqueOptionIds = Array.from(new Set(calculatedOptionIds));
    const uniqueLunchIds = Array.from(new Set(calculatedLunchOptionIds));
    const uniqueDinnerIds = Array.from(new Set(calculatedDinnerOptionIds));

    if (uniqueOptionIds.length !== calculatedOptionIds.length) {
      issues.push('Duplicate option IDs found across mealSlots');
    }

    const hasCriticalIssues = issues.length > 0;
    const isLunchMatches = arraysEqual(plan.lunchOptionIds, uniqueLunchIds);
    const isDinnerMatches = arraysEqual(plan.dinnerOptionIds, uniqueDinnerIds);
    const isOptionMatches = arraysEqual(plan.optionIds, uniqueOptionIds);

    const alreadyCorrect =
      !hasCriticalIssues &&
      isLunchMatches &&
      isDinnerMatches &&
      isOptionMatches &&
      Array.isArray(plan.lunchOptionIds) &&
      Array.isArray(plan.dinnerOptionIds);

    let status: PlanMigrationAssessment['status'];
    let plannedUpdate: PlanMigrationAssessment['plannedUpdate'] | undefined;

    if (hasCriticalIssues) {
      status = 'REQUIRES_MANUAL_REVIEW';
    } else if (alreadyCorrect) {
      status = 'ALREADY_CORRECT';
    } else {
      status = 'CAN_MIGRATE';
      plannedUpdate = {
        optionIds: uniqueOptionIds,
        lunchOptionIds: uniqueLunchIds,
        dinnerOptionIds: uniqueDinnerIds,
      };
    }

    assessments.push({
      planId,
      planName,
      status,
      issues,
      calculated: {
        optionIds: uniqueOptionIds,
        lunchOptionIds: uniqueLunchIds,
        dinnerOptionIds: uniqueDinnerIds,
      },
      plannedUpdate,
    });
  }

  const alreadyCorrectCount = assessments.filter((a) => a.status === 'ALREADY_CORRECT').length;
  const safelyMigratableCount = assessments.filter((a) => a.status === 'CAN_MIGRATE').length;
  const requiresManualReviewCount = assessments.filter((a) => a.status === 'REQUIRES_MANUAL_REVIEW').length;

  return {
    totalInspected: assessments.length,
    alreadyCorrectCount,
    safelyMigratableCount,
    requiresManualReviewCount,
    assessments,
  };
}

export function printReport(report: MealPlanMigrationReport): void {
  console.log('\n============================================================');
  console.log('   MEAL PLAN OPTION IDS MIGRATION — DRY-RUN AUDIT REPORT   ');
  console.log('============================================================\n');
  console.log(`Total plans inspected:        ${report.totalInspected}`);
  console.log(`Plans already correct:        ${report.alreadyCorrectCount}`);
  console.log(`Plans that can be migrated:   ${report.safelyMigratableCount}`);
  console.log(`Plans requiring manual review:${report.requiresManualReviewCount}`);
  console.log('------------------------------------------------------------\n');

  for (const a of report.assessments) {
    console.log(`[${a.status}] Plan: "${a.planName}" (ID: ${a.planId})`);
    if (a.issues.length > 0) {
      console.log('  ⚠️  Issues:');
      for (const iss of a.issues) {
        console.log(`     - ${iss}`);
      }
    }
    if (a.plannedUpdate) {
      console.log('  📝 Planned update:');
      console.log(`     optionIds:       ${JSON.stringify(a.plannedUpdate.optionIds)}`);
      console.log(`     lunchOptionIds:  ${JSON.stringify(a.plannedUpdate.lunchOptionIds)}`);
      console.log(`     dinnerOptionIds: ${JSON.stringify(a.plannedUpdate.dinnerOptionIds)}`);
    }
    console.log('');
  }
}

// CLI entry point
export function runMealPlanCli(): void {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => a.startsWith('--input='));

  if (!inputArg) {
    console.log('ℹ️  No --input=<path> file provided. Running with sample test fixtures.');
    console.log('   To analyze exported data, run:');
    console.log('   npx tsx scripts/migrate-meal-plan-option-ids.ts --input=./mealPlans_export.json\n');

    // Run sample fixture demonstration
    const sampleFixtures: MealPlanDocRaw[] = [
      {
        id: 'plan-legacy-no-fields',
        name: 'Historical Plan Without Option Fields',
        mealSlots: [
          {
            mealType: 'breakfast',
            isCustomerSelectable: false,
            options: [{ id: 'b-1', label: 'Idli Vada' }],
          },
          {
            mealType: 'lunch',
            isCustomerSelectable: true,
            options: [
              { id: 'l-1', label: 'South Meals' },
              { id: 'l-2', label: 'Ragi Mudde' },
            ],
          },
          {
            mealType: 'dinner',
            isCustomerSelectable: true,
            options: [{ id: 'd-1', label: 'Chapati Curry' }],
          },
        ],
      },
      {
        id: 'plan-already-correct',
        name: 'Already Migrated Standard Plan',
        mealSlots: [
          {
            mealType: 'breakfast',
            isCustomerSelectable: false,
            options: [{ id: 'b-1', label: 'Idli' }],
          },
          {
            mealType: 'lunch',
            isCustomerSelectable: true,
            options: [{ id: 'l-1', label: 'Rice Sambar' }],
          },
          {
            mealType: 'dinner',
            isCustomerSelectable: true,
            options: [{ id: 'd-1', label: 'Roti Dal' }],
          },
        ],
        optionIds: ['l-1', 'd-1'],
        lunchOptionIds: ['l-1'],
        dinnerOptionIds: ['d-1'],
      },
      {
        id: 'plan-malformed',
        name: 'Inconsistent Plan With Missing Option ID',
        mealSlots: [
          {
            mealType: 'lunch',
            isCustomerSelectable: true,
            options: [
              { label: 'Unidentified Meal (missing id)' } as any,
              { id: 'l-ok', label: 'Valid Meal' },
            ],
          },
        ],
      },
    ];

    const report = inspectMealPlans(sampleFixtures);
    printReport(report);
    console.log('Notice: Production meal-plan document counts cannot be established locally');
    console.log('without an authorized Firestore export. Never execute migrations against production.\n');
  } else {
    const filePath = path.resolve(inputArg.split('=')[1]);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const plans: MealPlanDocRaw[] = Array.isArray(rawData) ? rawData : rawData.documents || [];
    const report = inspectMealPlans(plans);
    printReport(report);
  }
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('migrate-meal-plan-option-ids.ts'));

if (isDirectExecution) {
  runMealPlanCli();
}
