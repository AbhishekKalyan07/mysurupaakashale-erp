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

let count = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Add Timestamp import if Timestamp is used but not imported
  if (content.match(/\bTimestamp\b/) && !content.includes('import { Timestamp }') && !content.includes('import type { Timestamp }')) {
    content = `import { Timestamp } from 'firebase/firestore';\n` + content;
  }
  
  // Fix remaining serverTimestamp() issues
  content = content.replace(/lastUpdated:\s*serverTimestamp\(\),/g, 'lastUpdated: serverTimestamp() as unknown as Timestamp,');
  content = content.replace(/createdAt:\s*serverTimestamp\(\),/g, 'createdAt: serverTimestamp() as unknown as Timestamp,');
  content = content.replace(/updatedAt:\s*serverTimestamp\(\),/g, 'updatedAt: serverTimestamp() as unknown as Timestamp,');
  
  // specific fix for missing DeliveryAssignment import
  if (file.replace(/\\/g, '/').endsWith('src/shared/services/firestore/deliveryRepository.ts')) {
    if (!content.includes('DeliveryAssignment')) {
       // if it still doesn't have it, we just inject it at the top
       content = `import type { DeliveryAssignment } from '@/shared/types';\n` + content;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    count++;
  }
});

console.log(`Fixed ${count} files with Timestamp imports/casts.`);
