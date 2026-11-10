import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Orphan Subscription Audit Workflow Invariants', () => {
  const workflowPath = path.resolve(
    process.cwd(),
    '.github/workflows/orphan-subscription-audit.yml'
  );

  it('verifies that orphan-subscription-audit.yml exists', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
  });

  it('verifies that the audit workflow is strictly manual (workflow_dispatch only)', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Must have workflow_dispatch
    expect(content).toContain('workflow_dispatch:');

    // Must require expected_project_id input
    expect(content).toContain('expected_project_id:');
    expect(content).toContain('required: true');

    // Must NOT have automated triggers
    expect(content).not.toContain('schedule:');
    expect(content).not.toMatch(/^\s*push:/m);
    expect(content).not.toMatch(/^\s*pull_request:/m);
  });

  it('verifies least-privilege permissions on the audit workflow', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('permissions:');
    expect(content).toContain('contents: read');
    expect(content).not.toContain('contents: write');
    expect(content).not.toContain('id-token: write');
  });

  it('verifies required secrets and project environment variable mappings in orphan-subscription-audit.yml', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Dedicated automation key and service account secrets
    expect(content).toContain('FIREBASE_AUTOMATION_API_KEY: ${{ secrets.FIREBASE_AUTOMATION_API_KEY }}');
    expect(content).toContain('FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}');

    // All required Firebase project variables
    expect(content).toContain('VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}');
    expect(content).toContain('VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}');
    expect(content).toContain('VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}');
    expect(content).toContain('VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}');
    expect(content).toContain('VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}');

    // Browser restricted key must NOT be passed to the audit runner
    expect(content).not.toContain('VITE_FIREBASE_API_KEY:');
  });

  it('verifies that the audit executes only scripts/auditOrphanSubscriptions.ts and no deployment or modification commands', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Must run only the isolated audit script
    expect(content).toContain('scripts/auditOrphanSubscriptions.ts');
    expect(content).toContain('--project "$EXPECTED_PROJECT_ID"');

    // Must not execute business automation workflows
    expect(content).not.toContain('scripts/automation/daily.ts');
    expect(content).not.toContain('scripts/automation/weekly.ts');
    expect(content).not.toContain('scripts/automation/monthly.ts');
    expect(content).not.toContain('billing');

    // Must not execute deployment or build commands
    expect(content).not.toContain('npm run build');
    expect(content).not.toContain('deploy');
    expect(content).not.toContain('hosting');
  });
});
