import './automation/env';
import { subscriptionCleanupService } from '../src/shared/services/business/subscriptionCleanupService';
import { authenticateReadOnlyForAudit } from './automation/auditAuth';

function parseTargetProjectId(): string {
  const args = process.argv.slice(2);
  let targetProjectId = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      targetProjectId = args[i + 1].trim();
      break;
    }
    if (!args[i].startsWith('--')) {
      targetProjectId = args[i].trim();
      break;
    }
  }

  if (!targetProjectId) {
    console.error(`\n❌ Error: An explicit target Firebase project ID is required.`);
    console.error(`Usage: npx vite-node scripts/auditOrphanSubscriptions.ts <targetProjectId>`);
    console.error(`   or: npx vite-node scripts/auditOrphanSubscriptions.ts --project <targetProjectId>\n`);
    console.error(`Example for local emulator: npx vite-node scripts/auditOrphanSubscriptions.ts demo-test`);
    console.error(`Example for production:     npx vite-node scripts/auditOrphanSubscriptions.ts mysuru-paakashale-erp\n`);
    process.exit(1);
  }

  return targetProjectId;
}

async function main() {
  const targetProjectId = parseTargetProjectId();
  console.log(`--- Starting Strictly Read-Only Orphan Subscription Audit (Target: ${targetProjectId}) ---`);

  try {
    console.log(`[Audit CLI] Authenticating via read-only identity preflight...`);
    await authenticateReadOnlyForAudit(targetProjectId);
    console.log(`[Audit CLI] Authenticated successfully as read-only automation admin.`);

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId,
      dryRun: true,
      strictAbortOnError: true,
    });

    console.log('\n' + report.markdownSummary + '\n');
    console.log('--- Audit Completed Successfully (Strictly Read-Only - 0 writes performed) ---');
  } catch (err: any) {
    console.error(`\n❌ Audit aborted with error: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
