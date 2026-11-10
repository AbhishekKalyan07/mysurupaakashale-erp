#!/usr/bin/env node

/**
 * Mysuru Paakashale ERP — Admin-Assisted Delivery Partner Password Recovery CLI
 *
 * Secure administrative recovery for delivery partners whose login emails do not have
 * accessible inboxes.
 *
 * SAFETY INVARIANTS:
 * 1. Strict Role Boundary: Operates ONLY on verified 'delivery_partner' accounts.
 *    Rejects customer, admin, kitchen, accounts, and deactivated accounts.
 * 2. Immutable Verification: Verifies immutable Firebase UID against /users/{uid} and Firebase Auth.
 * 3. Identity Preservation: Preserves existing account UID, role, staffId, phone registry,
 *    and profile. Zero modifications to /users/{uid} document.
 * 4. Credential Secrecy: Never prints passwords in application logs or files, never accepts
 *    passwords as CLI arguments. Communicates temporary password directly to the interactive
 *    terminal only.
 * 5. Full Audit Trail: Writes an immutable audit log entry to /auditLogs with operator identity.
 * 6. Explicit Confirmation: Requires operator to type 'RESET' to proceed.
 * 7. Fails closed if credentials, project ID, or target account cannot be verified.
 *
 * Usage:
 *   npx vite-node scripts/adminResetDeliveryPartnerPassword.ts <targetUid> --project <projectId>
 *   npx vite-node scripts/adminResetDeliveryPartnerPassword.ts --uid <targetUid> --project <projectId>
 *   npx vite-node scripts/adminResetDeliveryPartnerPassword.ts <targetUid> --project <projectId> --dry-run
 *   npx vite-node scripts/adminResetDeliveryPartnerPassword.ts <targetUid> --project <projectId> --confirm
 */

import * as readline from 'readline';
import {
  initializeAdminContext,
  verifyTargetDeliveryPartner,
  executeDeliveryPartnerPasswordReset,
  IndeterminateRecoveryError,
  type ResetResult,
} from './admin/deliveryPartnerRecovery';

interface CliArgs {
  targetUid: string;
  projectId: string;
  confirm: boolean;
  dryRun: boolean;
  help: boolean;
  emulator: boolean;
  prod: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let targetUid = '';
  let projectId = '';
  let confirm = false;
  let dryRun = false;
  let help = false;
  let emulator = false;
  let prod = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--emulator') {
      emulator = true;
    } else if (arg === '--prod') {
      prod = true;
    } else if (arg === '--project') {
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
        console.error('Error: Flag --project requires a valid projectId argument.');
        process.exit(1);
      }
      projectId = args[++i].trim();
    } else if (arg === '--uid') {
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
        console.error('Error: Flag --uid requires a valid targetUid argument.');
        process.exit(1);
      }
      targetUid = args[++i].trim();
    } else if (!arg.startsWith('--') && !targetUid) {
      targetUid = arg.trim();
    }
  }

  return { targetUid, projectId, confirm, dryRun, help, emulator, prod };
}

function promptConfirmation(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const { targetUid, projectId, confirm: autoConfirm, dryRun, help, emulator, prod } = parseArgs();

  if (help) {
    console.log(`
Mysuru Paakashale ERP — Admin-Assisted Password Recovery CLI

Usage:
  npx vite-node scripts/adminResetDeliveryPartnerPassword.ts <targetUid> --project <projectId>
  npx vite-node scripts/adminResetDeliveryPartnerPassword.ts --uid <targetUid> --project <projectId> [flags]

Flags:
  --project <projectId>   Target Firebase Project ID (required)
  --uid <targetUid>       Firebase UID of target delivery partner
  --confirm               Bypass interactive prompt (for authorized non-interactive use)
  --dry-run               Validate target account without modifying password
  --prod                  Force production credentials (ADC / Service Account, bypass emulators)
  --emulator              Force local Firebase Emulators (127.0.0.1:9099 / :8085)
  --help, -h              Show this help message
`);
    process.exit(0);
  }

  if (!projectId) {
    console.error('\n❌ Error: Target project ID is required.');
    console.error('Specify with --project <projectId> (e.g. --project mysuru-paakashale-erp or demo-test)\n');
    process.exit(1);
  }

  if (!targetUid) {
    console.error('\n❌ Error: Target Delivery Partner Firebase UID is required.');
    console.error('Usage: npx vite-node scripts/adminResetDeliveryPartnerPassword.ts <targetUid> --project <projectId>\n');
    process.exit(1);
  }

  console.log('\n===================================================================');
  console.log('   MYSURU PAAKASHALE — ADMIN PASSWORD RECOVERY UTILITY');
  console.log('===================================================================');
  console.log(`Target Project : ${projectId}`);
  console.log(`Target UID     : ${targetUid}`);
  console.log(`Mode           : ${dryRun ? 'DRY-RUN (Validation Only)' : 'LIVE RECOVERY'}`);
  console.log('-------------------------------------------------------------------');

  try {
    // 1. Initialize administrative context
    console.log('Authenticating administrative session...');
    const forceEmulator = emulator ? true : (prod ? false : undefined);
    const adminCtx = await initializeAdminContext(projectId, { forceEmulator });
    console.log(`Authenticated as : ${adminCtx.operator.name} (${adminCtx.authMode})`);
    console.log('-------------------------------------------------------------------');

    // 2. Preflight verification of target account
    console.log('Verifying target account role and status...');
    const profile = await verifyTargetDeliveryPartner(adminCtx.auth, adminCtx.db, targetUid);

    console.log('\n--- TARGET ACCOUNT DETAILS ---');
    console.log(`UID             : ${profile.uid}`);
    console.log(`Name            : ${profile.displayName}`);
    console.log(`Role            : ${profile.role} (VERIFIED)`);
    console.log(`Staff ID        : ${profile.staffId}`);
    console.log(`Assigned Zones  : ${profile.zoneIds.length > 0 ? profile.zoneIds.join(', ') : 'None'}`);
    console.log(`Email (Masked)  : ${profile.emailMasked}`);
    console.log(`Phone (Masked)  : ${profile.phoneMasked}`);
    console.log(`Status          : ${profile.isActive ? 'Active' : 'Inactive'}`);
    console.log('-------------------------------------------------------------------\n');

    if (dryRun) {
      console.log('✅ DRY-RUN COMPLETE: Target account is verified and eligible for recovery.');
      console.log('Zero modifications were made.\n');
      process.exit(0);
    }

    if (!dryRun && autoConfirm && !process.stdout.isTTY) {
      console.error('\n❌ LIVE RECOVERY ABORTED:');
      console.error('Non-interactive live password reset (--confirm) is forbidden when stdout is redirected to a non-TTY.');
      console.error('Temporary credentials cannot be piped or logged to file.\n');
      process.exit(1);
    }

    // 3. Interactive confirmation
    let isConfirmed = autoConfirm;
    if (!isConfirmed) {
      console.log('⚠️  WARNING: This will reset the authentication password for this delivery partner.');
      console.log('   Their existing password will immediately stop working.\n');
      const input = await promptConfirmation("Type 'RESET' to confirm password reset: ");
      isConfirmed = input === 'RESET';
      if (!isConfirmed) {
        console.log('\n❌ Operation cancelled by operator. No changes made.\n');
        process.exit(1);
      }
    }

    // 4. Execute recovery
    console.log('\nGenerating secure temporary password and updating Firebase Auth...');
    let result: ResetResult;
    try {
      result = await executeDeliveryPartnerPasswordReset({
        auth: adminCtx.auth,
        db: adminCtx.db,
        targetUid: profile.uid,
        operator: adminCtx.operator,
        confirm: true,
        dryRun: false,
        expectedProjectId: projectId,
      });
    } catch (err: any) {
      if (err instanceof IndeterminateRecoveryError) {
        const isStderrTTY = Boolean(process.stderr.isTTY);
        console.error('\n===================================================================');
        console.error('⚠️  CRITICAL WARNING: INDETERMINATE RECOVERY OUTCOME');
        console.error('===================================================================');
        console.error(`Target Partner         : ${err.profile.displayName} (${err.profile.staffId})`);
        console.error(`Target UID             : ${err.profile.uid}`);
        console.error('-------------------------------------------------------------------');
        console.error('STATUS BREAKDOWN:');
        console.error('Firebase Auth update timed out or encountered an ambiguous transport error:');
        console.error(`  ${err.originalError.message}`);
        console.error('\nIt CANNOT BE DETERMINED whether the password mutation took effect.');
        console.error('-------------------------------------------------------------------');
        console.error(`GENERATED CREDENTIAL   : ${isStderrTTY ? err.temporaryPassword : '[SUPPRESSED — stderr redirected to non-TTY]'}`);
        console.error('-------------------------------------------------------------------');
        console.error('SAFE OPERATOR RECOVERY PROCEDURE:');
        console.error('1. DO NOT BLINDLY RETRY THE RESET.');
        console.error('2. Have the delivery partner attempt sign-in with their existing password first.');
        console.error('3. If their existing password fails, have them test the generated credential above.');
        console.error('4. If neither works, verify network connectivity and check Firebase Auth Console');
        console.error('   user metadata before initiating a fresh recovery.');
        console.error('===================================================================\n');
        process.exit(3);
      }

      console.error('\n❌ RECOVERY ABORTED (NO CREDENTIALS CHANGED):');
      console.error(`Reason: ${err?.message || err}\n`);
      process.exit(1);
    }

    // 5. Handle Partial Failure (SUCCESS_AUDIT_FAILED)
    if (result.outcome === 'SUCCESS_AUDIT_FAILED') {
      const isStdoutTTY = Boolean(process.stdout.isTTY);
      console.log('\n===================================================================');
      console.log('⚠️  CRITICAL NOTICE: PASSWORD RESET WITH AUDIT WRITE FAILURE');
      console.log('===================================================================');
      console.log(`Delivery Partner       : ${profile.displayName} (${profile.staffId})`);
      console.log(`Target UID             : ${profile.uid}`);
      console.log('-------------------------------------------------------------------');
      console.log('STATUS BREAKDOWN:');
      console.log('1. Firebase Authentication : ✅ SUCCESS — Password was updated in Auth.');
      console.log('2. Firestore Audit Log     : ❌ FAILED — Completion audit write failed.');
      console.log(`   Reason: ${result.auditError}`);
      console.log('-------------------------------------------------------------------');
      console.log(`TEMPORARY PASSWORD     : ${isStdoutTTY ? result.temporaryPassword : '[SUPPRESSED — stdout redirected to non-TTY]'}`);
      console.log('-------------------------------------------------------------------');
      console.log('MANDATORY OPERATOR RECOVERY PROCEDURE:');
      console.log('1. DO NOT RUN PASSWORD RESET AGAIN. Repeating the reset would overwrite');
      console.log('   this active temporary password and create further inconsistency.');
      console.log('2. The temporary password above IS ACTIVE. Securely communicate it to');
      console.log('   the delivery partner in person or via direct verified communication.');
      console.log('3. Once Firestore connectivity is restored, manually record an audit');
      console.log('   event referencing initiation audit ID:');
      console.log(`   ${result.initiationAuditId || 'N/A'}`);
      console.log('4. This password is NOT stored anywhere on disk or in database logs.');
      console.log('===================================================================\n');
      process.exit(2);
    }

    // 6. Standard SUCCESS_COMPLETE
    const isStdoutTTY = Boolean(process.stdout.isTTY);
    console.log('\n===================================================================');
    console.log('             PASSWORD RESET COMPLETED SUCCESSFULLY');
    console.log('===================================================================');
    console.log(`Delivery Partner       : ${profile.displayName} (${profile.staffId})`);
    console.log(`Target UID             : ${profile.uid}`);
    console.log('-------------------------------------------------------------------');
    console.log(`TEMPORARY PASSWORD     : ${isStdoutTTY ? result.temporaryPassword : '[SUPPRESSED — stdout redirected to non-TTY]'}`);
    console.log('-------------------------------------------------------------------');
    console.log('OPERATIONAL GUIDELINES:');
    console.log('1. Securely deliver this temporary password to the delivery partner in person');
    console.log('   or via verified direct communication.');
    console.log('2. DO NOT transmit this temporary password over unencrypted chat or SMS.');
    console.log('3. Advise the delivery partner to log in immediately on the login page.');
    console.log('4. This password is NOT stored anywhere on disk or in database logs.');
    console.log('5. Immutable audit records written to /auditLogs:');
    console.log(`   Initiation Audit ID : ${result.initiationAuditId}`);
    console.log(`   Completion Audit ID : ${result.completionAuditId}`);
    console.log('===================================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ RECOVERY FAILED:');
    console.error(`Reason: ${err?.message || err}\n`);
    process.exit(1);
  }
}

main();
