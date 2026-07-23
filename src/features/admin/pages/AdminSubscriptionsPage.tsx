import { Compass } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';

export function AdminSubscriptionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <Compass className="text-leaf-600" />
          Subscriptions
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          Monitor active meal plan subscriptions and pauses.
        </p>
      </div>

      <Card className="p-12 text-center text-ink-500">
        <Compass className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-ink-900 mb-2">Subscriptions Module</h3>
        <p>This section is under construction. Future updates will include a master list of all active subscriptions.</p>
      </Card>
    </div>
  );
}
