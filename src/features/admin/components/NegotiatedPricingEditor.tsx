import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { useSetNegotiatedPricing, useRemoveNegotiatedPricing } from '@/features/admin/hooks/useAdminSubscriptions';
import type { MealPlanPricing } from '@/shared/types/mealPlan.types';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

interface NegotiatedPricingEditorProps {
  subscriptionId: string;
  existingPricing?: MealPlanPricing;
  onClose: () => void;
}

const PRICING_KEYS = [
  'breakfast',
  'lunch',
  'dinner',
  'breakfast_lunch',
  'lunch_dinner',
  'breakfast_dinner',
  'breakfast_lunch_dinner',
] as const;

type PricingKey = typeof PRICING_KEYS[number];

export function NegotiatedPricingEditor({ subscriptionId, existingPricing, onClose }: NegotiatedPricingEditorProps) {
  const setNegotiatedPricing = useSetNegotiatedPricing();
  const removeNegotiatedPricing = useRemoveNegotiatedPricing();

  const initialState: Record<PricingKey, string> = PRICING_KEYS.reduce((acc, key) => {
    acc[key] = existingPricing && (existingPricing as any)[key] !== undefined ? String((existingPricing as any)[key]) : '';
    return acc;
  }, {} as Record<PricingKey, string>);

  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState<Record<PricingKey, string>>({} as Record<PricingKey, string>);

  const validate = (): boolean => {
    const newErrors: Record<PricingKey, string> = {} as Record<PricingKey, string>;
    let valid = true;
    for (const key of PRICING_KEYS) {
      const raw = values[key].trim();
      if (raw === '') {
        newErrors[key] = 'Value required';
        valid = false;
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || isNaN(num)) {
        newErrors[key] = 'Must be a finite number';
        valid = false;
        continue;
      }
      if (num < 0) {
        newErrors[key] = 'Must be non‑negative';
        valid = false;
        continue;
      }
    }
    setErrors(newErrors);
    return valid;
  };

  const handleChange = (key: PricingKey, val: string) => {
    setValues({ ...values, [key]: val });
    setErrors({ ...errors, [key]: '' });
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix validation errors');
      return;
    }
    const payload: MealPlanPricing = PRICING_KEYS.reduce((acc, key) => {
      (acc as any)[key] = Number(values[key]);
      return acc;
    }, {} as MealPlanPricing);
    try {
      await setNegotiatedPricing.mutateAsync({ subscriptionId, negotiatedPricing: payload });
      toast.success('Negotiated pricing saved');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save negotiated pricing');
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove negotiated pricing override for this subscription?')) return;
    try {
      await removeNegotiatedPricing.mutateAsync(subscriptionId);
      toast.success('Negotiated pricing removed');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove negotiated pricing');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full max-h-[90dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        <div className="p-4 sm:p-5 border-b border-primary/10 flex justify-between items-center bg-primary/5 shrink-0">
          <h3 className="text-lg font-bold text-primary font-display">Negotiated Pricing Override</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-text-muted hover:text-primary transition-colors rounded-full"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRICING_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-text-muted mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>
                <input
                  type="text"
                  value={values[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-sm bg-card text-text ${errors[key] ? 'border-danger' : 'border-border focus:border-secondary'}`}
                />
                {errors[key] && <p className="text-xs text-danger mt-1">{errors[key]}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={setNegotiatedPricing.isPending}
              className="flex-1 min-w-[90px] min-h-[40px]"
            >
              Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="flex-1 min-w-[90px] min-h-[40px]"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRemove}
              disabled={removeNegotiatedPricing.isPending}
              className="w-full sm:w-auto min-h-[40px]"
            >
              Remove Override
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
