import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { XCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { Subscription, MealPlan, MealPreference } from '@/shared/types';

interface EditSubscriptionModalProps {
  subscription: Subscription;
  plan: MealPlan;
  onClose: () => void;
}

export function EditSubscriptionModal({ subscription, plan, onClose }: EditSubscriptionModalProps) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(subscription.quantity || 1);
  const [enabledMeals, setEnabledMeals] = useState<Record<string, boolean>>({
    breakfast: subscription.mealPreferences.some(p => p.mealType === 'breakfast'),
    lunch: subscription.mealPreferences.some(p => p.mealType === 'lunch'),
    dinner: subscription.mealPreferences.some(p => p.mealType === 'dinner'),
  });

  const getOptionId = (type: string) => subscription.mealPreferences.find(p => p.mealType === type)?.selectedOptionId || '';
  const [lunchOptionId, setLunchOptionId] = useState<string>(getOptionId('lunch') || plan.mealSlots?.find(s => s.mealType === 'lunch')?.options?.[0]?.id || '');
  const [dinnerOptionId, setDinnerOptionId] = useState<string>(getOptionId('dinner') || plan.mealSlots?.find(s => s.mealType === 'dinner')?.options?.[0]?.id || '');

  const toggleMeal = (type: string) => {
    setEnabledMeals(prev => {
      const next = { ...prev, [type]: !prev[type] };
      if (!next.breakfast && !next.lunch && !next.dinner) return prev; // At least one must be selected
      return next;
    });
  };

  const selectedMealsCount = Object.values(enabledMeals).filter(Boolean).length;
  const pricePerMeal = Math.round(plan.pricePerDay / 3);
  const calculatedDailyPrice = pricePerMeal * selectedMealsCount;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const mealPreferences: MealPreference[] = [];
      if (enabledMeals.breakfast) {
        mealPreferences.push({ mealType: 'breakfast' as const, selectedOptionId: null });
      }
      if (enabledMeals.lunch) {
        mealPreferences.push({ mealType: 'lunch' as const, selectedOptionId: lunchOptionId });
      }
      if (enabledMeals.dinner) {
        mealPreferences.push({ mealType: 'dinner' as const, selectedOptionId: dinnerOptionId });
      }

      await subscriptionRepository.update(subscription.id, {
        quantity,
        mealPreferences,
        pricePerDaySnapshot: calculatedDailyPrice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.active(subscription.customerId) });
      toast.success('Subscription updated successfully.');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update subscription.');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-xl w-full bg-white p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-400 hover:text-ink-600">
          <XCircle size={20} />
        </button>
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">Edit Meal Plan</h2>
        <p className="text-ink-600 text-sm font-sans mb-6">Modify your preferences. Changes will affect future deliveries and pro-rata billing.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-between items-center bg-rice-50 p-4 rounded-xl border border-rice-200">
            <h3 className="font-sans font-bold text-ink-800 text-sm">Number of People</h3>
            <div className="flex items-center gap-2 bg-rice-100 rounded-lg p-1 border border-rice-300">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-8 h-8 bg-white rounded shadow-sm text-ink-700 font-bold">-</button>
              <span className="text-sm font-bold w-12 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity(q => Math.min(10, q + 1))} className="w-8 h-8 bg-white rounded shadow-sm text-ink-700 font-bold">+</button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-rice-300 bg-rice-50 cursor-pointer">
              <input type="checkbox" checked={enabledMeals.breakfast} onChange={() => toggleMeal('breakfast')} className="w-5 h-5 accent-emerald-600 rounded" />
              <div className="flex-1">
                <h4 className="font-sans font-bold text-ink-800 text-sm">Breakfast Slot</h4>
                <p className="text-ink-500 text-xs mt-1">Daily rotating menu</p>
              </div>
            </label>

            <div className={`space-y-3 transition-opacity ${!enabledMeals.lunch ? 'opacity-50 grayscale' : ''}`}>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={enabledMeals.lunch} onChange={() => toggleMeal('lunch')} className="w-5 h-5 accent-emerald-600 rounded" />
                <h3 className="text-ink-900 font-bold font-sans text-sm">Lunch Slot</h3>
              </label>
              <div className="pl-8 space-y-3">
                {plan?.mealSlots?.find((s) => s.mealType === 'lunch')?.options.map((option) => (
                  <label key={option.id} className={`block p-3 rounded-xl border-2 cursor-pointer ${lunchOptionId === option.id && enabledMeals.lunch ? 'border-emerald-600 bg-emerald-50/20' : 'border-rice-300'}`}>
                    <div className="flex items-start gap-3">
                      <input type="radio" checked={lunchOptionId === option.id} onChange={() => setLunchOptionId(option.id)} disabled={!enabledMeals.lunch} className="mt-1 accent-emerald-600" />
                      <div>
                        <h4 className="font-sans font-bold text-ink-900 text-sm">{option.label}</h4>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={`space-y-3 transition-opacity ${!enabledMeals.dinner ? 'opacity-50 grayscale' : ''}`}>
              <label className="flex items-center gap-3 pt-4 border-t border-rice-300">
                <input type="checkbox" checked={enabledMeals.dinner} onChange={() => toggleMeal('dinner')} className="w-5 h-5 accent-emerald-600 rounded" />
                <h3 className="text-ink-900 font-bold font-sans text-sm">Dinner Slot</h3>
              </label>
              <div className="pl-8 space-y-3">
                {plan?.mealSlots?.find((s) => s.mealType === 'dinner')?.options.map((option) => (
                  <label key={option.id} className={`block p-3 rounded-xl border-2 cursor-pointer ${dinnerOptionId === option.id && enabledMeals.dinner ? 'border-emerald-600 bg-emerald-50/20' : 'border-rice-300'}`}>
                    <div className="flex items-start gap-3">
                      <input type="radio" checked={dinnerOptionId === option.id} onChange={() => setDinnerOptionId(option.id)} disabled={!enabledMeals.dinner} className="mt-1 accent-emerald-600" />
                      <div>
                        <h4 className="font-sans font-bold text-ink-900 text-sm">{option.label}</h4>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-rice-50 p-4 rounded-xl border border-rice-200">
            <div className="flex justify-between font-sans text-sm mb-2">
              <span className="text-ink-600">New Daily Rate:</span>
              <span className="font-bold text-ink-900">₹{calculatedDailyPrice * quantity}</span>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1 font-sans" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 font-sans" isLoading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
