import { describe, it, expect } from 'vitest';
import { runBundleAudit } from '../../scripts/auditProductionBundle';
import fs from 'node:fs';
import path from 'node:path';

describe('Production Bundle Exposure & Hardening Security Test', () => {
  const distDir = path.resolve(process.cwd(), 'dist');

  it('requires production build artifacts to exist in dist/', () => {
    expect(fs.existsSync(distDir)).toBe(true);
    const files = fs.readdirSync(distDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('ensures zero source map (.map) files exist in dist/', () => {
    function getMapFiles(dir: string, list: string[] = []): string[] {
      if (!fs.existsSync(dir)) return list;
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          getMapFiles(full, list);
        } else if (item.endsWith('.map')) {
          list.push(full);
        }
      }
      return list;
    }

    const mapFiles = getMapFiles(distDir);
    expect(mapFiles).toHaveLength(0);
  });

  it('passes automated production bundle audit with zero security violations', () => {
    const auditResult = runBundleAudit();
    expect(auditResult.errors).toHaveLength(0);
    expect(auditResult.passed).toBe(true);
  });

  it('ensures no emulator URLs or development seeding hooks leak into production JS assets', () => {
    const assetsDir = path.join(distDir, 'assets');
    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
      expect(content).not.toContain('127.0.0.1:9099');
      expect(content).not.toContain('127.0.0.1:8085');
      expect(content).not.toContain('sourceMappingURL');
    }
  });
});
