import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useBusinessSettings, useUpdateBusinessSettings } from '../hooks/useSettings';
import { Settings, Save, Store, IndianRupee, Clock, Truck, Play } from 'lucide-react';
import { useGenerateOrders } from '../hooks/useGenerateOrders';
import { useSeedData } from '../hooks/useSeedData';

const settingsSchema = z.object({
  companyProfile: z.object({
    name: z.string().min(1, 'Required'),
    tagline: z.string(),
    supportEmail: z.string().email(),
    supportPhone: z.string().min(10),
    address: z.string(),
  }),
  financials: z.object({
    gstPercentage: z.coerce.number().min(0).max(100),
    currency: z.string(),
    invoicePrefix: z.string(),
  }),
  pricing: z.object({
    mealPrices: z.object({
      breakfast: z.coerce.number().min(0),
      lunch: z.coerce.number().min(0),
      dinner: z.coerce.number().min(0),
    }),
    deliveryCharges: z.object({
      standard: z.coerce.number().min(0),
    }),
    securityDepositAmount: z.coerce.number().min(0),
  }),
  operations: z.object({
    orderCutoffTime: z.string(),
    kitchenTimings: z.object({ start: z.string(), end: z.string() }),
    deliveryWindows: z.object({
      breakfast: z.object({ start: z.string(), end: z.string() }),
      lunch: z.object({ start: z.string(), end: z.string() }),
      dinner: z.object({ start: z.string(), end: z.string() }),
    }),
    businessHolidays: z.string(), // We'll handle array conversion back and forth
  }),
  payroll: z.object({
    standardWorkingDays: z.coerce.number().min(1).max(31),
    standardWorkingHours: z.coerce.number().min(1).max(24),
    taxPercentage: z.coerce.number().min(0).max(100),
    leaveDeductionMultiplier: z.coerce.number().min(0),
  })
});

type SettingsForm = z.infer<typeof settingsSchema>;

export function BusinessSettingsPage() {
  const { data: settings, isLoading, isError } = useBusinessSettings();
  const updateMutation = useUpdateBusinessSettings();
  const { generateOrders, isGenerating } = useGenerateOrders();
  const { seedData, isSeeding } = useSeedData();

  const { register, handleSubmit, reset } = useForm<any>({
    resolver: zodResolver(settingsSchema)
  });

  useEffect(() => {
    if (settings) {
      reset({
        companyProfile: settings.companyProfile,
        financials: settings.financials,
        pricing: settings.pricing,
        operations: {
          ...settings.operations,
          businessHolidays: settings.operations.businessHolidays.join(', '),
        },
        payroll: settings.payroll || {
          standardWorkingDays: 22,
          standardWorkingHours: 8,
          taxPercentage: 0,
          leaveDeductionMultiplier: 1
        }
      });
    }
  }, [settings, reset]);

  const onSubmit = async (data: SettingsForm) => {
    const payload = {
      ...data,
      operations: {
        ...data.operations,
        businessHolidays: data.operations.businessHolidays.split(',').map(s => s.trim()).filter(Boolean)
      }
    };
    await updateMutation.mutateAsync(payload);
  };

  if (isLoading) return <LoadingScreen />;
  if (isError) return <div className="p-8 text-danger">Failed to load settings.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 pb-32">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <Settings className="text-leaf-600" />
          Business Settings
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          Configure global system parameters. Changes propagate immediately.
        </p>
      </div>

      <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Profile */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <Store size={20} className="text-ink-500" /> Company Profile
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Business Name</label>
              <input {...register('companyProfile.name')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Support Email</label>
              <input type="email" {...register('companyProfile.supportEmail')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Support Phone</label>
              <input type="tel" {...register('companyProfile.supportPhone')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-ink-700">Tagline</label>
              <input {...register('companyProfile.tagline')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-ink-700">Physical Address</label>
              <textarea {...register('companyProfile.address')} rows={2} className="w-full p-3 border rounded-lg resize-none" />
            </div>
          </div>
        </Card>

        {/* Pricing & Financials */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <IndianRupee size={20} className="text-ink-500" /> Pricing & Financials
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Breakfast Price (₹)</label>
              <input type="number" {...register('pricing.mealPrices.breakfast')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Lunch Price (₹)</label>
              <input type="number" {...register('pricing.mealPrices.lunch')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Dinner Price (₹)</label>
              <input type="number" {...register('pricing.mealPrices.dinner')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Standard Delivery (₹)</label>
              <input type="number" {...register('pricing.deliveryCharges.standard')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Security Deposit (₹)</label>
              <input type="number" {...register('pricing.securityDepositAmount')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">GST Percentage (%)</label>
              <input type="number" step="0.1" {...register('financials.gstPercentage')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Invoice Prefix</label>
              <input {...register('financials.invoicePrefix')} className="w-full h-10 px-3 border rounded-lg uppercase" />
            </div>
          </div>
        </Card>

        {/* Operations */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <Clock size={20} className="text-ink-500" /> Operations
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Order Cutoff Time (24h)</label>
              <input type="time" {...register('operations.orderCutoffTime')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">Kitchen Start</label>
                <input type="time" {...register('operations.kitchenTimings.start')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">Kitchen End</label>
                <input type="time" {...register('operations.kitchenTimings.end')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-ink-700">Business Holidays (YYYY-MM-DD, comma separated)</label>
              <input placeholder="2025-01-01, 2025-08-15" {...register('operations.businessHolidays')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
          </div>
        </Card>

        {/* Delivery Windows */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <Truck size={20} className="text-ink-500" /> Delivery Windows
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-800">Breakfast</h3>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">Start</label>
                <input type="time" {...register('operations.deliveryWindows.breakfast.start')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">End</label>
                <input type="time" {...register('operations.deliveryWindows.breakfast.end')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-800">Lunch</h3>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">Start</label>
                <input type="time" {...register('operations.deliveryWindows.lunch.start')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">End</label>
                <input type="time" {...register('operations.deliveryWindows.lunch.end')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-800">Dinner</h3>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">Start</label>
                <input type="time" {...register('operations.deliveryWindows.dinner.start')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-500">End</label>
                <input type="time" {...register('operations.deliveryWindows.dinner.end')} className="w-full h-10 px-3 border rounded-lg" />
              </div>
            </div>
          </div>
        </Card>

        {/* Payroll Settings */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <IndianRupee size={20} className="text-ink-500" /> Payroll Configuration
          </h2>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Standard Working Days / Mo</label>
              <input type="number" {...register('payroll.standardWorkingDays')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Standard Working Hours / Day</label>
              <input type="number" {...register('payroll.standardWorkingHours')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Tax Deduction (%)</label>
              <input type="number" step="0.1" {...register('payroll.taxPercentage')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Leave Deduction Multiplier</label>
              <input type="number" step="0.1" {...register('payroll.leaveDeductionMultiplier')} className="w-full h-10 px-3 border rounded-lg" />
            </div>
          </div>
        </Card>

        {/* Manual Operations */}
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2 border-b border-rice-200 pb-2">
            <Play size={20} className="text-emerald-600" /> Manual Operations (Spark Plan)
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-ink-800 text-sm">Generate Today's Orders</h3>
              <p className="text-xs text-ink-500">
                Manually trigger order generation for all active subscriptions. Usually runs automatically, but moved to manual execution to save Cloud Function costs.
              </p>
              <Button type="button" onClick={generateOrders} isLoading={isGenerating} className="mt-2 text-sm bg-emerald-600 hover:bg-emerald-700">
                Generate Today's Orders
              </Button>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-ink-800 text-sm">Seed Production Data</h3>
              <p className="text-xs text-ink-500">
                Initializes the database with default Meal Plans and Business Settings. Run this once on a fresh deployment to set up the system.
              </p>
              <Button type="button" onClick={seedData} isLoading={isSeeding} className="mt-2 text-sm bg-emerald-600 hover:bg-emerald-700">
                Seed Data
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-rice-200 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] z-40">
        <div className="max-w-4xl mx-auto flex justify-end">
          <Button type="submit" form="settings-form" isLoading={updateMutation.isPending} size="lg">
            <Save size={18} className="mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
