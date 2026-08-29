import type { ProductionProgress } from '@/shared/services/business/productionService';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { ChefHat, Loader2, CheckCircle2, Inbox, Percent } from 'lucide-react';

interface Props {
  progress: ProductionProgress;
}

export function KitchenSummaryCards({ progress }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
      
      {/* 1. Today's Orders */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-turmeric-500">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <ChefHat size={14} className="text-turmeric-500" />
          Today's Orders
        </div>
        <div className="text-2xl font-data font-bold text-ink-900">
          {progress.total}
        </div>
      </Card>

      {/* 2. Pending */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-info">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <Inbox size={14} className="text-info" />
          Pending
        </div>
        <div className="text-2xl font-data font-bold text-ink-900">
          {progress.scheduled}
        </div>
      </Card>

      {/* 3. Preparing */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-warning">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <Loader2 size={14} className="text-warning animate-spin" />
          Preparing
        </div>
        <div className="text-2xl font-data font-bold text-ink-900">
          {progress.packing}
        </div>
      </Card>

      {/* 4. Packed */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-leaf-500">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <CheckCircle2 size={14} className="text-leaf-500" />
          Packed
        </div>
        <div className="text-2xl font-data font-bold text-ink-900">
          {progress.packed}
        </div>
      </Card>

      {/* 5. Ready */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-success">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <CheckCircle2 size={14} className="text-success" />
          Ready
        </div>
        <div className="text-2xl font-data font-bold text-ink-900">
          {progress.ready}
        </div>
      </Card>

      {/* 6. Cancelled */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-danger bg-danger-subtle/30">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <Percent size={14} className="text-danger" />
          Cancelled
        </div>
        <div className="text-2xl font-data font-bold text-danger">
          {progress.cancelled}
        </div>
      </Card>

      {/* 5. Completion % */}
      <Card className="p-4 flex flex-col justify-between gap-2 border-l-4 border-l-leaf-600 bg-leaf-50/30">
        <div className="flex items-center gap-1.5 text-ink-500 font-sans text-xs uppercase tracking-wider font-bold">
          <Percent size={14} className="text-leaf-600" />
          Completion
        </div>
        <div className="text-2xl font-data font-bold text-leaf-700">
          {progress.completionPercentage}%
        </div>
      </Card>
      
    </div>
  );
}
