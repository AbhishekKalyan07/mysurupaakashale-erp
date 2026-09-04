const fs = require('fs');
let block = fs.readFileSync('block.ts', 'utf8');

// Replace generateDailyOrders with generateBreakfastOrders
block = block.replace(/describe\('generateDailyOrders'/g, "describe('generateBreakfastOrders'");
block = block.replace(/generateDailyOrders/g, 'generateBreakfastOrders');

// Fix assertions
block = block.replace(/expect\(res\.success\)\.toBe\(true\);\s*/g, '');
block = block.replace(/expect\(res\.message\)\.toBe\([^)]+\);\s*/g, '');
block = block.replace(/expect\(res\.ordersGenerated\)/g, 'expect(res)');

let currentFile = fs.readFileSync('src/shared/services/business/__tests__/orderService.test.ts', 'utf8');

// Put the imports back
if (!currentFile.includes('subscriptionRepository')) {
  currentFile = currentFile.replace(
    "import { orderRepository } from '../../firestore/orderRepository';",
    "import { orderRepository } from '../../firestore/orderRepository';\nimport { subscriptionRepository } from '../../firestore/subscriptionRepository';\nimport { orderGenerationRunRepository } from '../../firestore/analyticsRepository';"
  );
}

// Insert block before describe('generateOrdersForSubscription'
currentFile = currentFile.replace(/describe\('generateOrdersForSubscription',\s*\(\)\s*=>\s*\{/, block + "\n  describe('generateOrdersForSubscription', () => {");

fs.writeFileSync('src/shared/services/business/__tests__/orderService.test.ts', currentFile);
console.log('Restored the block successfully.');
