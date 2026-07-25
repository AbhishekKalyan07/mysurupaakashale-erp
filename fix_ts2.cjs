const fs = require('fs');
const path = require('path');

const missingImports = [
  'src/shared/services/firestore/notificationRepository.ts',
  'src/shared/services/firestore/subscriptionRepository.ts',
  'src/shared/services/firestore/auditRepository.ts'
];

missingImports.forEach(p => {
  const file = path.join('d:\\mysuru-paakashale-ERP claude', p.replace(/\//g, '\\'));
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('import { Timestamp }') && !content.includes('import type { Timestamp }')) {
      content = `import { Timestamp } from 'firebase/firestore';\n` + content;
      fs.writeFileSync(file, content);
    }
  }
});

// Fix DeliveryAssignment import properly
const deliveryRepo = 'd:\\mysuru-paakashale-ERP claude\\src\\shared\\services\\firestore\\deliveryRepository.ts';
let deliveryRepoContent = fs.readFileSync(deliveryRepo, 'utf8');
if (!deliveryRepoContent.includes('DeliveryAssignment')) {
  deliveryRepoContent = deliveryRepoContent.replace(/import type { DeliveryZone } from '\.\.\/\.\.\/types';/, "import type { DeliveryZone, DeliveryAssignment } from '../../types';");
  fs.writeFileSync(deliveryRepo, deliveryRepoContent);
}

// Check if FieldValue is still failing
let auditRepo = fs.readFileSync('d:\\mysuru-paakashale-ERP claude\\src\\shared\\services\\firestore\\auditRepository.ts', 'utf8');
auditRepo = auditRepo.replace(/timestamp:\s*serverTimestamp\(\),/g, 'timestamp: serverTimestamp() as unknown as Timestamp,');
fs.writeFileSync('d:\\mysuru-paakashale-ERP claude\\src\\shared\\services\\firestore\\auditRepository.ts', auditRepo);

console.log('Fixed more typescript errors');
