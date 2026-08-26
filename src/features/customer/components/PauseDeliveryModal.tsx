import { useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

import { getTodayIST } from '@/shared/utils/dateUtils';

export function PauseDeliveryModal({ subscription, onClose, skipDay }: any) {
  const todayStr = getTodayIST();
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
  // Calculate tomorrow in IST
  const tomorrowObj = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + 1));
  const minDateStr = tomorrowObj.toISOString().split('T')[0];

  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);

  // For future dates, all preferred meals are eligible
  const eligibleMealsForSelected = date ? (subscription.mealPreferences || []).map((p: any) => p.mealType) : [];

  const handlePause = async () => {
    if (!date || selectedMeals.length === 0) return;
    try {
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date,
        mealTypes: selectedMeals,
        reason: reason || 'Customer requested pause'
      });
      onClose();
    } catch (err) {
      console.error('Failed to pause delivery:', err);
      alert('Failed to pause delivery.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-primary/20">
        <h2 className="text-2xl font-bold font-display text-primary mb-4">Schedule Pause</h2>
        <p className="text-sm font-sans text-text-muted mb-6 font-medium leading-relaxed bg-primary/5 p-4 rounded-xl border border-primary/10">
          Select a future date to pause deliveries. You can choose which specific meals to cancel for that day.
        </p>

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Select Date</label>
        <input 
          type="date" 
          value={date} 
          min={minDateStr}
          onChange={e => {
            const newDate = e.target.value;
            setDate(newDate);
            setSelectedMeals(newDate ? (subscription.mealPreferences || []).map((p: any) => p.mealType) : []);
          }}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-6 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm font-data"
        />

        {date && eligibleMealsForSelected.length > 0 && (
          <div className="mb-6 bg-primary/5 p-4 rounded-xl border border-primary/10">
            <label className="block text-xs font-bold text-primary mb-3 font-sans uppercase tracking-wider">Select Meals to Cancel</label>
            <div className="space-y-3">
              {eligibleMealsForSelected.map((meal: string) => (
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
                    className="w-4 h-4 rounded border-primary/20 text-gold focus:ring-gold cursor-pointer"
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

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Reason (Optional)</label>
        <input 
          type="text" 
          value={reason} 
          placeholder="e.g. Out of town"
          onChange={e => setReason(e.target.value)}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm placeholder:text-text-muted/50"
        />

        <div className="flex gap-4">
          <Button variant="secondary" className="flex-1 font-bold" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 font-bold" onClick={handlePause} isLoading={skipDay.isPending} disabled={!date || selectedMeals.length === 0}>Confirm Pause</Button>
        </div>
      </div>
    </div>
  );
}
