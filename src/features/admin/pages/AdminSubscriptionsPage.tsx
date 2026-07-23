import { Compass } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';

export function AdminSubscriptionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Subscriptions"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Subscriptions' }]}
      />

      <Card className="p-12 text-center text-leaf-500">
        <Compass className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-leaf-900 mb-2">Subscriptions Module</h3>
        <p>This section is under construction. Future updates will include a master list of all active subscriptions.</p>
      </Card>
    </div>
  );
}
