const fs = require('fs');
const files = [
  'tests/active-backend/automatedDeliveryAssignment.test.ts',
  'tests/active-backend/dayInTheLifeSimulation.test.ts',
  'tests/active-backend/orderService.holiday.test.ts'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/from '\.\.\/orderService'/g, "from '../../functions/src/orders'");
  content = content.replace(/from '\.\.\/\.\.\/firestore\/(.*)'/g, "from '../../functions/src/repositories'");
  content = content.replace(/from 'firebase\/firestore'/g, "from '../../functions/src/compat'");
  fs.writeFileSync(file, content);
}
console.log('Fixed imports in 3 files');
