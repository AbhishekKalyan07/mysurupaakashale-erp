import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Automation Auth Smoke Test Workflow & Isolation Invariants', () => {
  const workflowPath = path.resolve(
    process.cwd(),
    '.github/workflows/automation-auth-smoke.yml'
  );
  const deployWorkflowPath = path.resolve(
    process.cwd(),
    '.github/workflows/deploy.yml'
  );

  it('verifies that automation-auth-smoke.yml exists', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
  });

  it('verifies that the smoke test workflow is strictly manual (workflow_dispatch only)', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Must have workflow_dispatch
    expect(content).toContain('workflow_dispatch:');

    // Must NOT have automated triggers
    expect(content).not.toContain('schedule:');
    expect(content).not.toMatch(/^\s*push:/m);
    expect(content).not.toMatch(/^\s*pull_request:/m);
  });

  it('verifies least-privilege permissions on the smoke test workflow', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('permissions:');
    expect(content).toContain('contents: read');
    expect(content).not.toContain('contents: write');
    expect(content).not.toContain('id-token: write');
  });

  it('verifies required secrets and project environment variable mappings in automation-auth-smoke.yml', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Dedicated key and service account secrets
    expect(content).toContain('FIREBASE_AUTOMATION_API_KEY: ${{ secrets.FIREBASE_AUTOMATION_API_KEY }}');
    expect(content).toContain('FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}');

    // All required Firebase project variables
    expect(content).toContain('VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}');
    expect(content).toContain('VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}');
    expect(content).toContain('VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}');
    expect(content).toContain('VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}');
    expect(content).toContain('VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}');

    // Browser restricted key must NOT be passed to the smoke test runner
    expect(content).not.toContain('VITE_FIREBASE_API_KEY:');
  });

  it('verifies that the smoke test executes only smokeTestAuth.ts and no deployment or business-automation commands', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    // Must run only the isolated smoke test entry point
    expect(content).toContain('scripts/automation/smokeTestAuth.ts');

    // Must not execute business automation workflows
    expect(content).not.toContain('scripts/automation/daily.ts');
    expect(content).not.toContain('scripts/automation/weekly.ts');
    expect(content).not.toContain('scripts/automation/monthly.ts');
    expect(content).not.toContain('billing');
    expect(content).not.toContain('order');

    // Must not execute deployment or build commands
    expect(content).not.toContain('npm run build');
    expect(content).not.toContain('deploy');
    expect(content).not.toContain('hosting');
  });

  it('verifies that deploy.yml retains VITE_FIREBASE_API_KEY and does not include FIREBASE_AUTOMATION_API_KEY', () => {
    const content = fs.readFileSync(deployWorkflowPath, 'utf-8');
    expect(content).toContain('VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}');
    expect(content).not.toContain('FIREBASE_AUTOMATION_API_KEY');
  });
});
