const fs = require('fs');
const path = require('path');

const files = [
  { path: 'src/features/admin/pages/AdminSubscriptionsPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/admin/pages/PaymentVerificationPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/admin/pages/AuditLogsPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/admin/pages/StaffManagementPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/admin/pages/BusinessSettingsPage.tsx', skeleton: 'FormSkeleton' },
  { path: 'src/features/admin/pages/AdminCustomersPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/kitchen/pages/DailyMenuListPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/kitchen/pages/InventoryPage.tsx', skeleton: 'TableSkeleton' },
  { path: 'src/features/kitchen/pages/ProductionBoardPage.tsx', skeleton: 'DashboardCardsSkeleton' },
  { path: 'src/features/kitchen/pages/DailyMenuEditorPage.tsx', skeleton: 'FormSkeleton' },
  { path: 'src/features/delivery/pages/DeliveryDashboardPage.tsx', skeleton: 'DashboardCardsSkeleton' },
  { path: 'src/features/delivery/pages/DeliveryPartnerPage.tsx', skeleton: 'DashboardCardsSkeleton' }
];

for (const file of files) {
  const fullPath = path.join(process.cwd(), file.path);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${file.path}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // Replace LoadingScreen import
  content = content.replace(
    /import \{ LoadingScreen \} from '@\/shared\/components\/feedback\/LoadingScreen';/g,
    `import { ${file.skeleton} } from '@/shared/components/feedback/SkeletonLoader';`
  );

  // Replace <LoadingScreen /> component usage
  content = content.replace(
    /<LoadingScreen \/>/g,
    `<div className="p-8"><${file.skeleton} /></div>`
  );

  fs.writeFileSync(fullPath, content);
  console.log(`Updated ${file.path}`);
}
