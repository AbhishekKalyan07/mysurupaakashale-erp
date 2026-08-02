import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { Truck, Package, PackageCheck, AlertCircle, MapPin, CheckCircle2 } from 'lucide-react';
import type { DeliverySummary } from '@/shared/services/business/deliveryService';

interface Props {
  summary: DeliverySummary;
}

export function DeliverySummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <MapPin size={20} className="text-primary mb-2" />
        <span className="text-2xl font-bold font-display text-primary">{summary.assigned}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Assigned</span>
      </Card>
      
      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <Package size={20} className="text-warning mb-2" />
        <span className="text-2xl font-bold font-display text-warning">{summary.pickedUp}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Picked Up</span>
      </Card>
      
      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <Truck size={20} className="text-info mb-2" />
        <span className="text-2xl font-bold font-display text-info">{summary.outForDelivery}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Out for Delivery</span>
      </Card>
      
      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <PackageCheck size={20} className="text-success mb-2" />
        <span className="text-2xl font-bold font-display text-success">{summary.delivered}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Delivered</span>
      </Card>

      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <AlertCircle size={20} className="text-danger mb-2" />
        <span className="text-2xl font-bold font-display text-danger">{summary.failed}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Failed</span>
      </Card>

      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <AlertCircle size={20} className="text-warning mb-2" />
        <span className="text-2xl font-bold font-display text-warning">{summary.returned}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Returned</span>
      </Card>

      <Card className="p-4 flex flex-col items-center justify-center text-center bg-rice-50/50">
        <CheckCircle2 size={20} className="text-ink-600 mb-2" />
        <span className="text-2xl font-bold font-display text-ink-900">{summary.remaining}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Remaining</span>
      </Card>

      <Card className="p-4 flex flex-col items-center justify-center text-center bg-gold/10 border-gold/30">
        <span className="text-3xl font-bold font-display text-gold">{summary.completionPercentage}%</span>
        <span className="text-xs text-gold/80 font-medium uppercase tracking-wider mt-1">Completion</span>
      </Card>
    </div>
  );
}
