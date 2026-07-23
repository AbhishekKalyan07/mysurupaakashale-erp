import { Package } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';

export function AdminOrdersPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <Package className="text-leaf-600" />
          Orders
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          Track daily order workflow and history.
        </p>
      </div>

      <Card className="p-12 text-center text-ink-500">
        <Package className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-ink-900 mb-2">Orders Module</h3>
        <p>This section is under construction. Future updates will include today's live order tracking.</p>
      </Card>
    </div>
  );
}
