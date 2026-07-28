import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { FormSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { useBusinessSettings, useUpdateBusinessSettings } from '../hooks/useSettings';
import { Save, Store, IndianRupee, Clock, Truck, Play } from 'lucide-react';
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

  if (isLoading) return <div className="p-8"><FormSkeleton /></div>;
  if (isError) return <div className="p-8 text-red-500 font-bold">Failed to load settings.</div>;

  return (
    <div className="space-y-8 pb-32">
      <PageHeader 
        userName="Business Settings"
        subtitle="Configure global system parameters. Changes propagate immediately."
      />

      <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Profile */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Store size={24} className="text-gold" /> Company Profile
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Input label="Business Name" {...register('companyProfile.name')} />
            <Input label="Support Email" type="email" autoCapitalize="none" autoCorrect="off" className="lowercase" {...register('companyProfile.supportEmail')} />
            <Input label="Support Phone" type="tel" {...register('companyProfile.supportPhone')} />
            <div className="md:col-span-2">
              <Input label="Tagline" {...register('companyProfile.tagline')} />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Physical Address</label>
              <textarea {...register('companyProfile.address')} rows={3} className="w-full rounded-xl border border-primary/20 bg-background px-4 py-3 text-sm font-sans text-primary placeholder:text-text-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold shadow-sm transition-colors resize-none" />
            </div>
          </div>
        </Card>

        {/* Pricing & Financials */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <IndianRupee size={24} className="text-gold" /> Pricing & Financials
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Input label="Breakfast Price (₹)" type="number" {...register('pricing.mealPrices.breakfast')} />
            <Input label="Lunch Price (₹)" type="number" {...register('pricing.mealPrices.lunch')} />
            <Input label="Dinner Price (₹)" type="number" {...register('pricing.mealPrices.dinner')} />
            <Input label="Standard Delivery (₹)" type="number" {...register('pricing.deliveryCharges.standard')} />
            <Input label="Security Deposit (₹)" type="number" {...register('pricing.securityDepositAmount')} />
            <Input label="GST Percentage (%)" type="number" step="0.1" {...register('financials.gstPercentage')} />
            <div className="md:col-span-3">
              <Input label="Invoice Prefix" className="uppercase" {...register('financials.invoicePrefix')} />
            </div>
          </div>
        </Card>

        {/* Operations */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Clock size={24} className="text-gold" /> Operations
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Input label="Order Cutoff Time (24h)" type="time" {...register('operations.orderCutoffTime')} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Kitchen Start" type="time" {...register('operations.kitchenTimings.start')} />
              <Input label="Kitchen End" type="time" {...register('operations.kitchenTimings.end')} />
            </div>
            <div className="md:col-span-2">
              <Input label="Business Holidays (YYYY-MM-DD, comma separated)" placeholder="2025-01-01, 2025-08-15" {...register('operations.businessHolidays')} />
            </div>
          </div>
        </Card>

        {/* Delivery Windows */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20 bg-primary/5">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Truck size={24} className="text-gold" /> Delivery Windows
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
              <h3 className="font-bold text-primary text-base border-b border-primary/10 pb-2">Breakfast</h3>
              <div className="space-y-3">
                <Input label="Start" type="time" {...register('operations.deliveryWindows.breakfast.start')} />
                <Input label="End" type="time" {...register('operations.deliveryWindows.breakfast.end')} />
              </div>
            </div>
            <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
              <h3 className="font-bold text-primary text-base border-b border-primary/10 pb-2">Lunch</h3>
              <div className="space-y-3">
                <Input label="Start" type="time" {...register('operations.deliveryWindows.lunch.start')} />
                <Input label="End" type="time" {...register('operations.deliveryWindows.lunch.end')} />
              </div>
            </div>
            <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
              <h3 className="font-bold text-primary text-base border-b border-primary/10 pb-2">Dinner</h3>
              <div className="space-y-3">
                <Input label="Start" type="time" {...register('operations.deliveryWindows.dinner.start')} />
                <Input label="End" type="time" {...register('operations.deliveryWindows.dinner.end')} />
              </div>
            </div>
          </div>
        </Card>

        {/* Payroll Settings */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <IndianRupee size={24} className="text-gold" /> Payroll Configuration
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <Input label="Standard Working Days / Mo" type="number" {...register('payroll.standardWorkingDays')} />
            <Input label="Standard Working Hours / Day" type="number" {...register('payroll.standardWorkingHours')} />
            <Input label="Tax Deduction (%)" type="number" step="0.1" {...register('payroll.taxPercentage')} />
            <Input label="Leave Deduction Multiplier" type="number" step="0.1" {...register('payroll.leaveDeductionMultiplier')} />
          </div>
        </Card>

        {/* Manual Operations */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Play size={24} className="text-emerald-600" /> Manual Operations (Spark Plan)
          </h2>
          <div className="grid md:grid-cols-1 gap-4">
            <div className="space-y-3 bg-primary/5 p-5 rounded-2xl border border-primary/10">
              <h3 className="font-bold text-primary text-base">Seed Production Data</h3>
              <p className="text-sm font-medium text-text-muted">
                Initializes the database with default Meal Plans and Business Settings. Run this once on a fresh deployment to set up the system.
              </p>
              <Button type="button" variant="primary" onClick={seedData} isLoading={isSeeding} className="mt-4 !bg-emerald-600 hover:!bg-emerald-700 shadow-md">
                Seed Data
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-primary/10 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] z-40 transition-all">
        <div className="max-w-4xl mx-auto flex justify-end">
          <Button type="submit" variant="primary" form="settings-form" isLoading={updateMutation.isPending} size="lg" className="shadow-lg px-8 py-4 text-base">
            <Save size={20} className="mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
