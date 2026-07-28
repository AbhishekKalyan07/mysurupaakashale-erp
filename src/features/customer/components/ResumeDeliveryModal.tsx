import { useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { subscriptionService } from '@/shared/services/business/subscriptionService';
import { orderService } from '@/shared/services/business/orderService';
import { db } from '@/shared/lib/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { toast } from 'react-hot-toast';
import type { Subscription, MealType } from '@/shared/types';
import { XCircle } from 'lucide-react';

interface ResumeDeliveryModalProps {
  subscription: Subscription;
  onClose: () => void;
}

export function ResumeDeliveryModal({ subscription, onClose }: ResumeDeliveryModalProps) {
  const [resumeDate, setResumeDate] = useState<'today' | 'tomorrow'>('today');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60; // e.g. 9.5 for 9:30 AM

  // Calculate cutoffs for today
  // Before 9:00 AM -> All meals
  // 9:00 AM to 12:30 PM -> Skip breakfast, resume lunch & dinner
  // 12:30 PM to 7:00 PM -> Skip breakfast & lunch, resume dinner
  // After 7:00 PM -> Cannot resume today
  let skippedMealsToday: MealType[] = [];
  let resumedMealsToday: MealType[] = [];
  let canResumeToday = true;

  if (currentHour >= 19) {
    canResumeToday = false;
  } else if (currentHour >= 12.5) {
    skippedMealsToday = ['breakfast', 'lunch'];
    resumedMealsToday = ['dinner'];
  } else if (currentHour >= 9) {
    skippedMealsToday = ['breakfast'];
    resumedMealsToday = ['lunch', 'dinner'];
  } else {
    skippedMealsToday = [];
    resumedMealsToday = ['breakfast', 'lunch', 'dinner'];
  }

  // Filter based on subscription preferences
  skippedMealsToday = skippedMealsToday.filter(meal => 
    subscription.mealPreferences.some(pref => pref.mealType === meal)
  );
  resumedMealsToday = resumedMealsToday.filter(meal => 
    subscription.mealPreferences.some(pref => pref.mealType === meal)
  );

  const handleResume = async () => {
    setLoading(true);
    try {
      if (resumeDate === 'today' && canResumeToday) {
        // Create skip record for missed meals today
        if (skippedMealsToday.length > 0) {
          const skipRef = doc(db, 'subscriptions', subscription.id, 'skips', today);
          await setDoc(skipRef, {
            date: today,
            mealTypes: skippedMealsToday,
            reason: 'Resumed late in the day',
            createdAt: serverTimestamp() as unknown as Timestamp,
            createdBy: subscription.customerId,
          });
        }
        
        // Generate remaining orders for today
        if (resumedMealsToday.length > 0) {
          await orderService.generateOrdersForSubscription(subscription, today, resumedMealsToday);
        }

        // Resume subscription immediately
        await subscriptionService.resumeSubscription(subscription);
        toast.success('Subscription resumed for today!');
      } else {
        // Schedule resume for tomorrow by setting pause end date to today
        // (pauseEndDate is inclusive, so it resumes tomorrow)
        await subscriptionService.pauseSubscription(subscription, true, subscription.pauseStartDate || today, today);
        toast.success('Subscription scheduled to resume tomorrow!');
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(subscription.customerId),
      });
      onClose();
    } catch (err) {
      console.error('Failed to resume delivery:', err);
      toast.error('Failed to resume delivery.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-400 hover:text-ink-600">
          <XCircle size={20} />
        </button>
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">Resume Subscription</h2>
        <p className="text-sm font-sans text-ink-600 mb-6">
          When would you like your meal deliveries to restart?
        </p>

        <div className="space-y-4 mb-6">
          {canResumeToday && (
            <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
              resumeDate === 'today' ? 'border-emerald-600 bg-emerald-50/20' : 'border-rice-300'
            }`}>
              <div className="flex items-start gap-3">
                <input 
                  type="radio" 
                  name="resumeDate" 
                  checked={resumeDate === 'today'}
                  onChange={() => setResumeDate('today')}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <h4 className="font-sans font-bold text-ink-900 text-sm">Resume Today</h4>
                  {resumedMealsToday.length > 0 ? (
                    <p className="text-ink-500 text-xs mt-1">
                      You will receive: <span className="font-bold text-emerald-700 capitalize">{resumedMealsToday.join(' & ')}</span> today.
                      {skippedMealsToday.length > 0 && ` (Missed ${skippedMealsToday.join(' & ')})`}
                    </p>
                  ) : (
                    <p className="text-rose-600 text-xs mt-1">
                      No more selected meals left for today based on cutoffs.
                    </p>
                  )}
                </div>
              </div>
            </label>
          )}

          {!canResumeToday && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-sans mb-4">
              It is too late to resume deliveries for today.
            </div>
          )}

          <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
            resumeDate === 'tomorrow' || !canResumeToday ? 'border-emerald-600 bg-emerald-50/20' : 'border-rice-300'
          }`}>
            <div className="flex items-start gap-3">
              <input 
                type="radio" 
                name="resumeDate" 
                checked={resumeDate === 'tomorrow' || !canResumeToday}
                onChange={() => setResumeDate('tomorrow')}
                disabled={!canResumeToday}
                className="mt-1 accent-emerald-600"
              />
              <div>
                <h4 className="font-sans font-bold text-ink-900 text-sm">Resume Tomorrow</h4>
                <p className="text-ink-500 text-xs mt-1">
                  Deliveries will restart automatically starting tomorrow morning.
                </p>
              </div>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 font-sans" onClick={onClose}>Cancel</Button>
          <Button 
            className="flex-1 font-sans" 
            onClick={handleResume} 
            isLoading={loading}
            disabled={resumeDate === 'today' && resumedMealsToday.length === 0 && canResumeToday}
          >
            Confirm Resume
          </Button>
        </div>
      </Card>
    </div>
  );
}
