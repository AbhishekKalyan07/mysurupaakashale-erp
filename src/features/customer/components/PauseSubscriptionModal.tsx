import { useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { subscriptionService } from '@/shared/services/business/subscriptionService';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { toast } from 'react-hot-toast';
import type { Subscription } from '@/shared/types';
import { XCircle, Calendar, PauseCircle } from 'lucide-react';

interface PauseSubscriptionModalProps {
  subscription: Subscription;
  onClose: () => void;
}

import { getTodayIST } from '@/shared/utils/dateUtils';

export function PauseSubscriptionModal({ subscription, onClose }: PauseSubscriptionModalProps) {
  const [updating, setUpdating] = useState(false);
  const queryClient = useQueryClient();

  // Calculate India local date and cutoff
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const timeInMinutes = hours * 60 + minutes;
  
  const prefs = (subscription.mealPreferences || []).map(p => p.mealType);
  let canCancelToday = false;
  if (prefs.includes('breakfast') && timeInMinutes < 7 * 60 + 30) canCancelToday = true;
  if (prefs.includes('lunch') && timeInMinutes < 10 * 60 + 30) canCancelToday = true;
  if (prefs.includes('dinner') && timeInMinutes < 16 * 60) canCancelToday = true;

  const todayInIndia = getTodayIST();
  const [todayYear, todayMonth, todayDay] = todayInIndia.split('-').map(Number);
  const minPauseDateObj = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + (canCancelToday ? 0 : 1)));
  const minDateStr = minPauseDateObj.toISOString().split('T')[0];

  const [pauseStartDate, setPauseStartDate] = useState(minDateStr);
  const [pauseEndDate, setPauseEndDate] = useState('');

  const handlePauseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseStartDate) {
      toast.error('Pause start date is required');
      return;
    }

    setUpdating(true);
    try {
      const shouldPauseNow = pauseStartDate <= todayInIndia;

      await subscriptionService.pauseSubscription(
        subscription,
        shouldPauseNow,
        pauseStartDate,
        pauseEndDate || null
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(subscription.customerId),
      });

      toast.success(shouldPauseNow ? 'Subscription paused successfully' : `Pause scheduled starting ${pauseStartDate}`);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to pause subscription:', err);
      toast.error((err as Error).message || 'Failed to pause subscription.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-white p-6 relative rounded-2xl shadow-2xl border border-primary/20">
        <button 
          aria-label="Close" 
          onClick={onClose} 
          className="absolute top-4 right-4 text-ink-500 hover:text-ink-700 transition-colors p-1"
        >
          <XCircle size={20} />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
            <PauseCircle size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-ink-900">Pause Subscription</h2>
            <p className="text-xs text-ink-600">Select dates to pause your meal deliveries</p>
          </div>
        </div>

        <p className="text-ink-600 text-xs font-sans mb-5 leading-relaxed bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
          Deliveries will be stopped starting from the start date. If you specify an end date, deliveries will automatically resume the following day.
        </p>
        
        <form onSubmit={handlePauseSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1.5 font-sans uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-emerald-600" /> Pause Start Date
            </label>
            <input
              type="date"
              value={pauseStartDate}
              min={minDateStr}
              onChange={(e) => setPauseStartDate(e.target.value)}
              className="w-full border border-ink-300 rounded-xl px-3 py-2.5 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-data"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1.5 font-sans uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-emerald-600" /> Pause End Date (Optional)
            </label>
            <input
              type="date"
              value={pauseEndDate}
              min={pauseStartDate || minDateStr}
              onChange={(e) => setPauseEndDate(e.target.value)}
              className="w-full border border-ink-300 rounded-xl px-3 py-2.5 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-data"
            />
            <p className="text-[11px] text-ink-500 mt-1 italic">Leave empty to pause indefinitely until you choose to resume.</p>
          </div>

          <div className="pt-2 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1 font-sans font-bold" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 font-sans font-bold" isLoading={updating}>
              Confirm Pause
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
