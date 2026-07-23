import { Package } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';

export function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Orders"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Orders' }]}
      />

      <Card className="p-12 text-center text-leaf-500">
        <Package className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-leaf-900 mb-2">Orders Module</h3>
        <p>This section is under construction. Future updates will include order generation and history.</p>
      </Card>
    </div>
  );
}
