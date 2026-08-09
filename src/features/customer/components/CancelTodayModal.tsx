import { useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

export function CancelTodayModal({ subscription, onClose, skipDay }: any) {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const nowInIndia = new Date(nowStr);
  const currentHour = nowInIndia.getHours();
  const currentMinute = nowInIndia.getMinutes();
  const timeInMinutes = currentHour * 60 + currentMinute;
  
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(nowInIndia);

  const preferredMeals = subscription.mealPreferences.map((p: any) => p.mealType);
  const eligibleMeals = preferredMeals.filter((meal: string) => {
    if (meal === 'breakfast') return timeInMinutes < 5 * 60;
    if (meal === 'lunch') return timeInMinutes < 10 * 60 + 30;
    if (meal === 'dinner') return timeInMinutes < 16 * 60;
    return true;
  });

  const [selectedMeals, setSelectedMeals] = useState<string[]>(eligibleMeals);
  const [reason, setReason] = useState('');

  const totalPreferredMeals = subscription.mealPreferences?.length || 1;
  const fullDailyValue = subscription.pricePerDaySnapshot * (subscription.quantity || 1);
  const creditAmount = Math.round((fullDailyValue / totalPreferredMeals) * selectedMeals.length);

  const handleCancel = async () => {
    if (selectedMeals.length === 0) return;
    try {
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date: todayStr,
        mealTypes: selectedMeals,
        reason: reason || 'Customer requested same-day cancel',
        creditAmount: creditAmount
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
                  <>You will receive a credit of <strong className="text-gold text-sm">₹{creditAmount}</strong> on your next month's bill.</>
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
