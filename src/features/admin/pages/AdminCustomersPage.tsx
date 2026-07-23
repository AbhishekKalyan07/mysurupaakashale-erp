import { Users } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';

export function AdminCustomersPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Customers"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]}
      />

      <Card className="p-12 text-center text-leaf-500">
        <Users className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-leaf-900 mb-2">Customer Module</h3>
        <p>This section is under construction. Future updates will include customer list and detailed profiles.</p>
      </Card>
    </div>
  );
}
