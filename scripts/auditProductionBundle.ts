import fs from 'node:fs';
import path from 'node:path';

interface ForbiddenPattern {
  name: string;
  regex: RegExp;
  severity: 'error' | 'warning';
  description: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // Source map references
  {
    name: 'source-map-reference',
    regex: /sourceMappingURL\s*=/i,
    severity: 'error',
    description: 'Direct sourceMappingURL comment discovered in production bundle',
  },
  // Private keys and certificates
  {
    name: 'private-key',
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE\s+KEY-----/i,
    severity: 'error',
    description: 'Embedded private cryptographic key block',
  },
  // Service Account credentials
  {
    name: 'service-account-token',
    regex: /"type":\s*"service_account"|"private_key_id":/i,
    severity: 'error',
    description: 'Google Cloud / Firebase Service Account JSON credentials',
  },
  // Database connection strings with credentials
  {
    name: 'db-connection-string',
    regex: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+@/i,
    severity: 'error',
    description: 'Database connection string containing embedded credentials',
  },
  // Cloud and platform tokens
  {
    name: 'github-token',
    regex: /ghp_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{82}/,
    severity: 'error',
    description: 'GitHub personal access token',
  },
  {
    name: 'aws-secret',
    regex: /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/i,
    severity: 'error',
    description: 'AWS secret access key assignment',
  },
  // Payment gateway secrets (Public publishable keys like rzp_test/rzp_live IDs are expected; live secrets are forbidden)
  {
    name: 'payment-secret',
    regex: /(?:razorpay_secret|rzp_secret|key_secret)\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i,
    severity: 'error',
    description: 'Payment gateway API secret / signing secret',
  },
  // SMTP credentials
  {
    name: 'smtp-credentials',
    regex: /smtp(?:s)?:\/\/[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+@/i,
    severity: 'error',
    description: 'SMTP URI with embedded password',
  },
  // Firebase Auth/Firestore emulator addresses hardcoded in production assets
  {
    name: 'hardcoded-emulator-host',
    regex: /(?:127\.0\.0\.1|localhost):(8085|9099|9199|5001)\b/,
    severity: 'error',
    description: 'Hardcoded local emulator host and port reference',
  },
  // Test runners accidentally bundled
  {
    name: 'test-runner-leak',
    regex: /from\s+['"]@playwright\/test['"]|from\s+['"]vitest['"]|@firebase\/rules-unit-testing/i,
    severity: 'error',
    description: 'Test runner dependency leaked into production bundle',
  },
];

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function runBundleAudit(): { passed: boolean; errors: string[]; warnings: string[] } {
  const distDir = path.resolve(process.cwd(), 'dist');
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log(`\n======================================================`);
  console.log(` PRODUCTION BUNDLE EXPOSURE AUDIT`);
  console.log(` Target Directory: ${distDir}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(distDir)) {
    errors.push(`Distribution directory does not exist: ${distDir}. Run 'npm run build' first.`);
    return { passed: false, errors, warnings };
  }

  const allFiles = getAllFiles(distDir);
  console.log(`Discovered ${allFiles.length} files in dist/ to inspect.\n`);

  // Check 1: Ensure no *.map files exist
  const mapFiles = allFiles.filter((f) => f.endsWith('.map'));
  if (mapFiles.length > 0) {
    errors.push(`Found ${mapFiles.length} source map (.map) file(s) in dist/: ${mapFiles.map(f => path.relative(distDir, f)).join(', ')}`);
  } else {
    console.log(`[PASS] Source Map Files: 0 .map files found on disk.`);
  }

  // Check 2: Scan browser-delivered assets
  const scannableExtensions = ['.js', '.mjs', '.html', '.css', '.json', '.webmanifest'];
  const scannableFiles = allFiles.filter((f) => scannableExtensions.includes(path.extname(f).toLowerCase()));

  console.log(`Scanning ${scannableFiles.length} browser-delivered assets for forbidden patterns...`);

  let patternMatchesCount = 0;

  for (const filePath of scannableFiles) {
    const relativePath = path.relative(distDir, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const pattern of FORBIDDEN_PATTERNS) {
      const match = pattern.regex.exec(content);
      if (match) {
        patternMatchesCount++;
        const snippet = content.substring(Math.max(0, match.index - 30), Math.min(content.length, match.index + 50))
          .replace(/\r?\n/g, ' ');
        const message = `[${pattern.name}] in ${relativePath}: ${pattern.description} (near: "...${snippet}...")`;
        if (pattern.severity === 'error') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  if (errors.length === 0) {
    console.log(`[PASS] Forbidden Patterns: All ${FORBIDDEN_PATTERNS.length} rules checked across ${scannableFiles.length} files. Zero violations.`);
  } else {
    console.error(`\n[FAIL] Found ${errors.length} security violation(s):`);
    errors.forEach((err) => console.error(`  - ${err}`));
  }

  if (warnings.length > 0) {
    console.warn(`\n[WARN] Found ${warnings.length} warning(s):`);
    warnings.forEach((warn) => console.warn(`  - ${warn}`));
  }

  const passed = errors.length === 0;
  console.log(`\n======================================================`);
  console.log(` AUDIT SUMMARY: ${passed ? 'PASSED (CLEAN PRODUCTION BUNDLE)' : 'FAILED'}`);
  console.log(` Total Files: ${allFiles.length} | Scanned: ${scannableFiles.length} | Errors: ${errors.length} | Warnings: ${warnings.length}`);
  console.log(`======================================================\n`);

  return { passed, errors, warnings };
}

// Execute directly if run via CLI
const isDirectRun = process.argv.some((arg) => arg.includes('auditProductionBundle'));
if (isDirectRun) {
  const result = runBundleAudit();
  if (!result.passed) {
    process.exit(1);
  }
}
