const fs = require('fs');
const path = require('path');

const dupes = [
  'src/features/admin/hooks/useAuditLogs.ts',
  'src/features/admin/pages/AuditLogsPage.tsx',
  'src/features/analytics/hooks/useAnalyticsData.ts',
  'src/features/dashboard/pages/AdminDashboardPage.tsx',
  'src/features/kitchen/pages/ProductionBoardPage.tsx',
  'src/features/notifications/types/notification.types.ts',
  'src/shared/services/firestore/accountsRepository.ts',
  'src/shared/types/analytics.types.ts',
  'src/shared/types/billing.types.ts',
  'src/shared/types/delivery.types.ts',
  'src/shared/types/index.ts',
  'src/shared/types/kitchen.types.ts',
  'src/shared/types/mealPlan.types.ts',
  'src/shared/types/order.types.ts',
  'src/shared/types/payment.types.ts',
  'src/shared/types/subscription.types.ts'
];

dupes.forEach(p => {
  const file = path.join('d:\\mysuru-paakashale-ERP claude', p.replace(/\//g, '\\'));
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace("import { Timestamp } from 'firebase/firestore';\n", '');
    fs.writeFileSync(file, content);
  }
});
console.log('Fixed duplicates');
