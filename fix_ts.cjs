const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('d:\\mysuru-paakashale-ERP claude\\src');

// 1. Fix missing imports
const missingTimestampImports = [
  'src/shared/services/firestore/automationService.ts',
  'src/shared/services/firestore/deliveryRepository.ts',
  'src/shared/services/firestore/orderRepository.ts',
  'src/shared/types/feedback.types.ts',
  'src/shared/types/inventory.types.ts',
  'src/features/kitchen/hooks/useProductionBoard.ts',
  'src/shared/services/business/customerService.ts',
  'src/shared/services/business/deliveryService.ts',
  'src/shared/services/business/orderService.ts',
  'src/shared/services/business/paymentService.ts',
  'src/shared/services/business/subscriptionService.ts'
];

// Add Timestamp import if missing
files.forEach(file => {
  const relPath = file.replace(/\\/g, '/').split('d:/mysuru-paakashale-ERP claude/')[1];
  if (missingTimestampImports.some(p => file.replace(/\\/g, '/').endsWith(p))) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('import { Timestamp }') && !content.includes('import type { Timestamp }')) {
      content = `import { Timestamp } from 'firebase/firestore';\n` + content;
      fs.writeFileSync(file, content);
    }
  }
});

// Fix DeliveryAssignment import
let deliveryRepo = fs.readFileSync('d:\\mysuru-paakashale-ERP claude\\src\\shared\\services\\firestore\\deliveryRepository.ts', 'utf8');
if (!deliveryRepo.includes('DeliveryAssignment')) {
  deliveryRepo = deliveryRepo.replace(/import type { DeliveryZone } from '\.\.\/\.\.\/types';/, `import type { DeliveryZone, DeliveryAssignment } from '../../types';`);
  fs.writeFileSync('d:\\mysuru-paakashale-ERP claude\\src\\shared\\services\\firestore\\deliveryRepository.ts', deliveryRepo);
}

// 2. Replace err.message with (err as Error).message globally
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  content = content.replace(/err\.message/g, '(err as Error).message');
  content = content.replace(/error\.message/g, '(error as Error).message');
  
  // 3. Fix FieldValue missing properties from Timestamp (serverTimestamp() without cast)
  // Usually this looks like: `createdAt: serverTimestamp(),` or `updatedAt: serverTimestamp(),`
  content = content.replace(/createdAt:\s*serverTimestamp\(\),/g, 'createdAt: serverTimestamp() as unknown as Timestamp,');
  content = content.replace(/updatedAt:\s*serverTimestamp\(\),/g, 'updatedAt: serverTimestamp() as unknown as Timestamp,');
  content = content.replace(/createdAt:\s*serverTimestamp\(\)/g, 'createdAt: serverTimestamp() as unknown as Timestamp');
  content = content.replace(/updatedAt:\s*serverTimestamp\(\)/g, 'updatedAt: serverTimestamp() as unknown as Timestamp');
  content = content.replace(/timestamp:\s*serverTimestamp\(\)/g, 'timestamp: serverTimestamp() as unknown as Timestamp');
  
  // also fix some specific cases in useAdminSubscriptions and auditRepository
  content = content.replace(/timestamp:\s*serverTimestamp\(\),\s*\/\/\s*Could be captured/g, 'timestamp: serverTimestamp() as unknown as Timestamp, // Could be captured');

  if (content !== original) {
    fs.writeFileSync(file, content);
  }
});

console.log('Fixed typescript errors');
