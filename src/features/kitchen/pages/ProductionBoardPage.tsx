import { useState, useMemo } from 'react';
import { ChefHat, Printer, Lock, LockOpen } from 'lucide-react';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { APP_CONFIG } from '@/shared/config/appConfig';

// Hooks & Services
import { useProductionBoard, getTodayIST } from '@/features/kitchen/hooks/useProductionBoard';
import { ProductionService } from '@/shared/services/business/productionService';
import { dailyProductionRepository } from '@/shared/services/firestore/dailyProductionRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';

// Sub-components
import { KitchenSummaryCards } from '@/features/kitchen/components/KitchenSummaryCards';
import { KitchenProductionTable } from '@/features/kitchen/components/KitchenProductionTable';
import { KitchenProductionSummary } from '@/features/kitchen/components/KitchenProductionSummary';
import { PackingList } from '@/features/kitchen/components/PackingList';
import { PrintPackingSheet } from '@/features/kitchen/components/PrintPackingSheet';
import { UnlockProductionModal } from '@/features/kitchen/components/UnlockProductionModal';

export function ProductionBoardPage() {
  const today = getTodayIST();
  
  const {
    orders,
    zoneMap,
    partnerMap,
    customerMap,
    isLoading,
    advanceStatus,
    productionState,
    role,
    user,
    profile
  } = useProductionBoard();

  const [activeTab, setActiveTab] = useState<'summary' | 'production' | 'packing'>('summary');
  const [isUnlockModalOpen, setUnlockModalOpen] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Business Logic & Aggregations
  // ───────────────────────────────────────────────────────────────────────────
  
  const summary = useMemo(() => ProductionService.getProductionSummary(orders), [orders]);
  const progress = useMemo(() => ProductionService.getProductionProgress(orders), [orders]);
  const areaGroups = useMemo(() => ProductionService.getAreaPacking(orders, zoneMap), [orders, zoneMap]);
  const printRows = useMemo(() => ProductionService.getPrintPackingSheet(orders, zoneMap, partnerMap, customerMap), [orders, zoneMap, partnerMap, customerMap]);

  const isLocked = productionState?.status === 'locked';

  // ───────────────────────────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────────────────────────

  const handleLockProduction = async () => {
    if (!user) return;
    setIsLocking(true);
    try {
      const snapshot = { ...summary, date: today, version: 1 };
      await dailyProductionRepository.lockProduction(today, user.uid, snapshot);
      
      await auditRepository.logAction(
        'locked_production',
        user.uid,
        profile?.fullName || user.email || 'Unknown User',
        today,
        'daily_production',
        { snapshot }
      );
    } catch (err) {
      console.error('Failed to lock production:', err);
    } finally {
      setIsLocking(false);
    }
  };

  const handleUnlockProduction = async (reason: string) => {
    if (!user) return;
    await dailyProductionRepository.unlockProduction(today, user.uid, reason);
    
    await auditRepository.logAction(
      'unlocked_production',
      user.uid,
      profile?.fullName || user.email || 'Unknown User',
      today,
      'daily_production',
      { reason }
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-8"><DashboardCardsSkeleton /></div>;
  }

  const displayDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: APP_CONFIG.timezone
  }).format(new Date(`${today}T00:00:00+05:30`));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 relative">
      
      {/* ── Print Overlay ── */}
      <PrintPackingSheet date={displayDate} rows={printRows} />

      {/* ── Unlock Modal ── */}
      <UnlockProductionModal
        isOpen={isUnlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        onConfirm={handleUnlockProduction}
      />

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <ChefHat size={28} className="text-leaf-600" />
            Kitchen Dashboard
            
            {isLocked && (
              <Badge variant="warning" className="ml-2 gap-1 px-2.5 py-1 text-xs">
                <Lock size={12} /> Production Locked
              </Badge>
            )}
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            <time dateTime={today}>{displayDate}</time>
            {' · '}{summary.total} total orders
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          
          {!isLocked && productionState?.status !== 'closed' && (
            <Button
              variant="secondary"
              onClick={handleLockProduction}
              isLoading={isLocking}
              disabled={isLocking}
              className="flex items-center gap-2 bg-ink-900 text-white hover:bg-ink-800"
            >
              <Lock size={16} /> Lock Production
            </Button>
          )}

          {isLocked && role === 'admin' && (
            <Button
              variant="secondary"
              onClick={() => setUnlockModalOpen(true)}
              className="flex items-center gap-2 text-warning hover:bg-warning-subtle/20 border-warning-subtle"
            >
              <LockOpen size={16} /> Unlock (Admin)
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="flex items-center gap-2"
          >
            <Printer size={16} /> Print Packing Sheet
          </Button>
        </div>
      </div>

      {/* ── Top Summary Cards ── */}
      <KitchenSummaryCards progress={progress} />

      {/* ── Tabs ── */}
      <div className="flex border-b border-rice-200">
        <button aria-label="Button action"
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 font-display font-bold text-sm border-b-2 transition-colors ${
            activeTab === 'summary' 
              ? 'border-leaf-600 text-leaf-700' 
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Production Summary
        </button>
        <button aria-label="Button action"
          onClick={() => setActiveTab('production')}
          className={`px-4 py-2 font-display font-bold text-sm border-b-2 transition-colors ${
            activeTab === 'production' 
              ? 'border-leaf-600 text-leaf-700' 
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Packing List
        </button>
        <button aria-label="Button action"
          onClick={() => setActiveTab('packing')}
          className={`px-4 py-2 font-display font-bold text-sm border-b-2 transition-colors ${
            activeTab === 'packing' 
              ? 'border-turmeric-600 text-turmeric-700' 
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Area-wise Packing
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="mt-4">
        {activeTab === 'summary' && (
          <KitchenProductionSummary orders={orders} />
        )}

        {activeTab === 'production' && (
          <KitchenProductionTable
            orders={orders}
            zoneMap={zoneMap}
            partnerMap={partnerMap}
            customerMap={customerMap}
            onAdvanceStatus={advanceStatus}
            isAdvancing={false}
            isLocked={isLocked}
          />
        )}

        {activeTab === 'packing' && (
          <PackingList areaGroups={areaGroups} />
        )}
      </div>

    </div>
  );
}
