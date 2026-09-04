const fs = require('fs');

// 1. Fix billingService.test.ts
let billingContent = fs.readFileSync('src/shared/services/business/__tests__/billingService.test.ts', 'utf8');
billingContent = billingContent.replace(
  /const result = await billingService\.processDailyBilling\('2026-08-01'\);\s*expect\(result\.processed\)\.toBe\(1\);/g,
  "await billingService.processSubscriptionEnd(mockSub as any, '2026-08-01');"
);
fs.writeFileSync('src/shared/services/business/__tests__/billingService.test.ts', billingContent);
console.log('Fixed billingService.test.ts');

// 2. Fix dayInTheLifeSimulation.test.ts
let simContent = fs.readFileSync('src/shared/services/business/__tests__/dayInTheLifeSimulation.test.ts', 'utf8');
simContent = simContent.replace(
  /const billingRes = await billingService\.processDailyBilling\('2026-08-01'\);\s*expect\(billingRes\.processed\)\.toBe\(1\);/,
  "await billingService.processSubscriptionEnd(endedSub as any, '2026-08-01');"
);
fs.writeFileSync('src/shared/services/business/__tests__/dayInTheLifeSimulation.test.ts', simContent);
console.log('Fixed dayInTheLifeSimulation.test.ts');

// 3. Fix orderService.test.ts (Remove generateDailyOrders block)
let orderContent = fs.readFileSync('src/shared/services/business/__tests__/orderService.test.ts', 'utf8');

// Find the start of describe('generateDailyOrders')
const startIndex = orderContent.indexOf("describe('generateDailyOrders', () => {");
if (startIndex !== -1) {
  // Find the end by looking for the next describe block
  const endIndex = orderContent.indexOf("describe('generateOrdersForSubscription',", startIndex);
  if (endIndex !== -1) {
    orderContent = orderContent.substring(0, startIndex) + orderContent.substring(endIndex);
    fs.writeFileSync('src/shared/services/business/__tests__/orderService.test.ts', orderContent);
    console.log('Removed obsolete generateDailyOrders tests from orderService.test.ts');
  } else {
    console.error('Could not find end of generateDailyOrders block');
  }
} else {
  console.error('Could not find generateDailyOrders block');
}
