const fs = require('fs');
const files = [
  'src/shared/services/business/__tests__/billing.holiday.test.ts',
  'src/shared/services/business/__tests__/billingService.test.ts',
  'src/shared/services/business/__tests__/automatedDeliveryAssignment.test.ts',
  'src/shared/services/business/__tests__/dayInTheLifeSimulation.test.ts',
  'src/shared/services/business/__tests__/orderService.test.ts',
  'src/shared/services/business/__tests__/orderService.holiday.test.ts',
  'src/shared/services/business/__tests__/unskip.test.ts'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/vi\.mock\('@\/shared\/lib\/firebase', \(\) => \(\{/, "vi.mock('@/shared/lib/firebase', () => ({\n  functions: {},\n");
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
}
