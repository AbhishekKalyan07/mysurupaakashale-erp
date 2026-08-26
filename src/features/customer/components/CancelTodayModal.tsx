import { useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

import { getTodayIST } from '@/shared/utils/dateUtils';

export function CancelTodayModal({ subscription, onClose, skipDay }: any) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const timeInMinutes = currentHour * 60 + currentMinute;
  
  const todayStr = getTodayIST();

  const preferredMeals = (subscription.mealPreferences || []).map((p: any) => p.mealType);
  const eligibleMeals = preferredMeals.filter((meal: string) => {
    if (meal === 'breakfast') return timeInMinutes < 5 * 60;
    if (meal === 'lunch') return timeInMinutes < 10 * 60 + 30;
    if (meal === 'dinner') return timeInMinutes < 16 * 60;
    return true;
  });

  const [selectedMeals, setSelectedMeals] = useState<string[]>(eligibleMeals);
  const [reason, setReason] = useState('');


  const handleCancel = async () => {
    if (selectedMeals.length === 0) return;
    try {
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date: todayStr,
        mealTypes: selectedMeals,
        reason: reason || 'Customer requested same-day cancel'
      });
      onClose();
    } catch (err) {
      console.error('Failed to cancel today:', err);
      alert('Failed to cancel today.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-primary/20">
        <h2 className="text-2xl font-bold font-display text-danger mb-4">Cancel Today's Meals</h2>
        
        {eligibleMeals.length === 0 ? (
          <div className="mb-6">
            <p className="text-danger font-bold bg-danger/10 p-4 rounded-xl border border-danger/20 text-sm">
              It is too late to cancel any meals for today based on the cut-off times.
            </p>
          </div>
        ) : (
          <div className="mb-6 bg-primary/5 p-4 rounded-xl border border-primary/10">
            <p className="text-sm font-sans text-text-muted mb-4 font-medium leading-relaxed">
              Select which meals you want to cancel for today.
            </p>
            <div className="space-y-3">
              {eligibleMeals.map((meal: string) => (
                <label key={meal} className="flex items-center gap-3 text-sm font-sans text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMeals.includes(meal)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMeals([...selectedMeals, meal]);
                      } else {
                        setSelectedMeals(selectedMeals.filter(m => m !== meal));
                      }
                    }}
                    className="w-4 h-4 rounded border-primary/20 text-danger focus:ring-danger cursor-pointer"
                  />
                  <span className="capitalize font-bold">{meal}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-primary/10">
              <p className="text-xs font-sans text-text-muted">
                {selectedMeals.length > 0 ? (
                  <>You will only be billed for the meals that are actually delivered. These cancelled meals will not be included in your bill.</>
                ) : (
                  <span className="text-danger font-medium">Please select at least one meal to cancel.</span>
                )}
              </p>
            </div>
          </div>
        )}

        {eligibleMeals.length > 0 && (
          <>
            <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Reason (Optional)</label>
            <input 
              type="text" 
              value={reason} 
              placeholder="e.g. Eating out"
              onChange={e => setReason(e.target.value)}
              className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm placeholder:text-text-muted/50"
            />
          </>
        )}

        <div className="flex gap-4">
          <Button variant="secondary" className="flex-1 font-bold" onClick={onClose}>Close</Button>
          {eligibleMeals.length > 0 && (
            <Button className="flex-1 font-bold !bg-danger hover:!bg-danger-dark !text-white !border-danger-dark" onClick={handleCancel} isLoading={skipDay.isPending} disabled={selectedMeals.length === 0}>
              Confirm Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
