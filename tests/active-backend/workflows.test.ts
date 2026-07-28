import * as fs from 'node:fs';
import * as path from 'node:path';

const workflow = (name: string) => fs.readFileSync(path.resolve(__dirname, '../../.github/workflows', name), 'utf8');

describe('production GitHub Actions automations', () => {
  it.each([
    ['daily.yml', "cron: '30 18 * * *'", 'scripts/automation/daily.ts'],
    ['weekly.yml', "cron: '30 18 * * 0'", 'scripts/automation/weekly.ts'],
    ['monthly.yml', "cron: '30 18 1 * *'", 'scripts/automation/monthly.ts'],
  ])('%s is scheduled and runs its active automation entry point', (file, cron, entryPoint) => {
    const content = workflow(file);
    expect(content).toContain(cron);
    expect(content).toContain('workflow_dispatch');
    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
    expect(content).toContain("node-version: '20'");
    expect(content).toContain('npm ci');
    expect(content).toContain(`npx vite-node --config vite.config.ts ${entryPoint}`);
    expect(content).toContain('VITE_AUTOMATION_EMAIL=${{ secrets.VITE_AUTOMATION_EMAIL }}');
    expect(content).toContain('VITE_AUTOMATION_PASSWORD=${{ secrets.VITE_AUTOMATION_PASSWORD }}');
  });

  it('does not deploy or invoke Firebase Cloud Functions', () => {
    const workflows = ['daily.yml', 'weekly.yml', 'monthly.yml'].map(workflow).join('\n');
    expect(workflows).not.toMatch(/firebase\s+deploy\s+--only\s+functions|firebase-functions|functions\/src/i);
  });
});
