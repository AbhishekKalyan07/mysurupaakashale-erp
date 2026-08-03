const fs = require('fs');

let content = fs.readFileSync('tests/security/storage.security.test.ts', 'utf8');

// Move getStorage inside describe
const toRemove = `// Helper to get connected storage
function getStorage(uid?: string) {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  const storage = ctx.storage();
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  storage.maxUploadRetryTime = 2000; // Fail fast instead of hanging
  return storage;
}

// Helper to get admin storage
function getAdminStorage() {
  const ctx = env.unauthenticatedContext();
  const storage = ctx.storage(); // In rules-unit-testing v2, admin storage is handled differently, but we can use withSecurityRulesDisabled
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  storage.maxUploadRetryTime = 2000;
  return storage;
}`;

content = content.replace(toRemove, '');

const toAdd = `  let env: RulesTestEnvironment;

  // Helper to get connected storage
  function getStorage(uid?: string) {
    const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
    return ctx.storage();
  }

  // Helper to get admin storage
  function getAdminStorage() {
    const ctx = env.unauthenticatedContext();
    return ctx.storage();
  }`;

content = content.replace('  let env: RulesTestEnvironment;', toAdd);

// Remove connectStorageEmulator and maxUploadRetryTime from inside withSecurityRulesDisabled
content = content.replace(/connectStorageEmulator\(storage,\s*'127\.0\.0\.1',\s*9199\);\s*storage\.maxUploadRetryTime\s*=\s*2000;/g, '');
content = content.replace(/connectStorageEmulator\(storage,\s*'127\.0\.0\.1',\s*9199\);/g, '');
content = content.replace(/storage\.maxUploadRetryTime\s*=\s*2000;/g, '');

// Replace ref(storage, ...) with storage.ref(...)
content = content.replace(/ref\(storage,\s*(.*?)\)/g, 'storage.ref($1)');

// Replace uploadBytes(ref, data, meta) with ref.put(data, meta)
content = content.replace(/uploadBytes\((.*?),\s*(.*?),\s*(.*?)\)/g, '$1.put($2, $3)');

// Replace getDownloadURL(ref) with ref.getDownloadURL()
content = content.replace(/getDownloadURL\((.*?)\)/g, '$1.getDownloadURL()');

fs.writeFileSync('tests/security/storage.security.test.ts', content);
