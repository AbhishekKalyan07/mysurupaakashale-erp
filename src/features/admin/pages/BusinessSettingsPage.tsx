import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import { FormSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { Link } from "react-router-dom";
import {
  useBusinessSettings,
  useUpdateBusinessSettings,
} from "../hooks/useSettings";
import { Save, Store, IndianRupee, Clock, Truck, Play, ArrowRight } from "lucide-react";
import { useSeedData } from "../hooks/useSeedData";
import toast from "react-hot-toast";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const deliveryWindowSchema = z
  .object({
    start: z.string().regex(TIME_REGEX, "Must be in HH:mm 24h format"),
    end: z.string().regex(TIME_REGEX, "Must be in HH:mm 24h format"),
  })
  .refine((data) => data.start < data.end, {
    message: "Start time must be before end time",
    path: ["start"],
  });

const cancellationCutoffsSchema = z.object({
  breakfast: z.string().regex(TIME_REGEX, "Must be in HH:mm 24h format"),
  lunch: z.string().regex(TIME_REGEX, "Must be in HH:mm 24h format"),
  dinner: z.string().regex(TIME_REGEX, "Must be in HH:mm 24h format"),
});

const settingsSchema = z.object({
  companyProfile: z.object({
    name: z.string().min(1, "Required"),
    tagline: z.string(),
    supportEmail: z.string().email(),
    supportPhone: z.string().min(10),
    address: z.string(),
  }),
  financials: z.object({
    gstPercentage: z.coerce.number().min(0).max(100),
    currency: z.string().default("INR"),
    invoicePrefix: z.string().default("INV"),
  }),
  pricing: z.object({
    mealPrices: z
      .object({
        breakfast: z.coerce.number().min(0).optional(),
        lunch: z.coerce.number().min(0).optional(),
        dinner: z.coerce.number().min(0).optional(),
      })
      .optional(),
    deliveryCharges: z.object({
      standard: z.coerce.number().min(0),
    }),
    securityDepositAmount: z.coerce.number().min(0),
  }),
  operations: z.object({
    orderCutoffTime: z.string(),
    kitchenTimings: z.object({ start: z.string(), end: z.string() }),
    deliveryWindows: z.object({
      breakfast: deliveryWindowSchema,
      lunch: deliveryWindowSchema,
      dinner: deliveryWindowSchema,
    }),
    cancellationCutoffTimes: cancellationCutoffsSchema,
    businessHolidays: z.string(), // We'll handle array conversion back and forth
  }),
  payroll: z.object({
    standardWorkingDays: z.coerce.number().min(1).max(31),
    standardWorkingHours: z.coerce.number().min(1).max(24),
    taxPercentage: z.coerce.number().min(0).max(100),
    leaveDeductionMultiplier: z.coerce.number().min(0),
  }),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export function BusinessSettingsPage() {
  const { data: settings, isLoading, isError } = useBusinessSettings();
  const updateMutation = useUpdateBusinessSettings();
  const { seedData, isSeeding } = useSeedData();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (settings) {
      reset({
        companyProfile: {
          name: settings.companyProfile?.name || "Mysuru Paakashale",
          tagline: settings.companyProfile?.tagline || "",
          supportEmail: settings.companyProfile?.supportEmail || "support@mysurupaakashale.com",
          supportPhone: settings.companyProfile?.supportPhone || "9876543210",
          address: settings.companyProfile?.address || "",
        },
        financials: {
          gstPercentage: settings.financials?.gstPercentage ?? 0,
          currency: settings.financials?.currency || "INR",
          invoicePrefix: settings.financials?.invoicePrefix || "INV",
        },
        pricing: settings.pricing,
        operations: {
          ...settings.operations,
          cancellationCutoffTimes: settings.operations
            .cancellationCutoffTimes ?? {
            breakfast: "05:00",
            lunch: "10:30",
            dinner: "16:00",
          },
          businessHolidays: (settings.operations?.businessHolidays ?? []).join(", "),
        },
        payroll: settings.payroll || {
          standardWorkingDays: 22,
          standardWorkingHours: 8,
          taxPercentage: 0,
          leaveDeductionMultiplier: 1,
        },
      });
    }
  }, [settings, reset]);

  const onError = (formErrors: any) => {
    console.warn("[BusinessSettingsPage] Validation errors:", formErrors);
    let msg = "Please fill in all required settings correctly.";
    if (formErrors.operations?.cancellationCutoffTimes) {
      const cutoffs = formErrors.operations.cancellationCutoffTimes;
      const first = cutoffs.breakfast || cutoffs.lunch || cutoffs.dinner;
      if (first?.message) msg = `Cutoff error: ${first.message}`;
    } else if (formErrors.operations?.deliveryWindows) {
      const wins = formErrors.operations.deliveryWindows;
      const first = wins.breakfast || wins.lunch || wins.dinner;
      const errMsg = first?.start?.message || first?.end?.message || first?.message;
      if (errMsg) msg = `Delivery window error: ${errMsg}`;
    } else {
      const firstKey = Object.keys(formErrors)[0];
      const firstVal = formErrors[firstKey];
      const fallbackMsg =
        firstVal?.message ||
        (firstVal ? (Object.values(firstVal)[0] as any) : null)?.message;
      if (fallbackMsg) msg = fallbackMsg;
    }
    toast.error(typeof msg === "string" ? msg : "Validation error in settings form.");
  };

  const onSubmit = async (data: SettingsForm) => {
    const payload = {
      ...data,
      pricing: {
        ...settings?.pricing,
        deliveryCharges: data.pricing.deliveryCharges,
        securityDepositAmount: data.pricing.securityDepositAmount,
        mealPrices: settings?.pricing?.mealPrices || {
          breakfast: 0,
          lunch: 0,
          dinner: 0,
        },
      },
      operations: {
        ...data.operations,
        businessHolidays: (data.operations?.businessHolidays || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };
    await updateMutation.mutateAsync(payload);
  };

  if (isLoading)
    return (
      <div className="p-8">
        <FormSkeleton />
      </div>
    );
  if (isError)
    return (
      <div className="p-8 text-red-500 font-bold">Failed to load settings.</div>
    );

  return (
    <div className="space-y-8 pb-32">
      <PageHeader
        userName="Business Settings"
        subtitle="Configure global system parameters. Changes propagate immediately."
      />

      <form
        id="settings-form"
        onSubmit={handleSubmit(onSubmit, onError)}
        className="space-y-6"
      >
        {/* Company Profile */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Store size={24} className="text-gold" /> Company Profile
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Input label="Business Name" {...register("companyProfile.name")} />
            <Input
              label="Support Email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              className="lowercase"
              {...register("companyProfile.supportEmail")}
            />
            <Input
              label="Support Phone"
              type="tel"
              {...register("companyProfile.supportPhone")}
            />
            <div className="md:col-span-2">
              <Input label="Tagline" {...register("companyProfile.tagline")} />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">
                Physical Address
              </label>
              <textarea
                {...register("companyProfile.address")}
                rows={3}
                className="w-full rounded-xl border border-primary/20 bg-background px-4 py-3 text-sm font-sans text-primary placeholder:text-text-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold shadow-sm transition-colors resize-none"
              />
            </div>
          </div>
        </Card>

        {/* Pricing & Financials */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <IndianRupee size={24} className="text-gold" /> Pricing & Financials
          </h2>
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-primary text-sm flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-gold" />
                Base Meal Pricing & Effective Dating
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Authoritative base pricing (Breakfast, Lunch, Dinner, Combos) is managed under Pricing Configuration with deterministic effective-date scheduling.
              </p>
            </div>
            <Link
              to="/admin/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-secondary px-4 py-2 text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
            >
              Manage Base Pricing
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Input
              label="Standard Delivery (₹)"
              type="number"
              {...register("pricing.deliveryCharges.standard")}
            />
            <Input
              label="Security Deposit (₹)"
              type="number"
              {...register("pricing.securityDepositAmount")}
            />
            <Input
              label="GST Percentage (%)"
              type="number"
              step="0.1"
              {...register("financials.gstPercentage")}
            />
            <Input
              label="Currency"
              className="uppercase"
              placeholder="INR"
              {...register("financials.currency")}
            />
            <div className="md:col-span-2">
              <Input
                label="Invoice Prefix"
                className="uppercase"
                {...register("financials.invoicePrefix")}
              />
            </div>
          </div>
        </Card>

        {/* OPERATIONAL SETTINGS */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20 bg-primary/5" data-testid="operational-settings-card">
          <div className="border-b border-primary/10 pb-4">
            <h2 className="text-xl font-bold text-primary flex items-center gap-3 font-display">
              <Clock size={24} className="text-gold" /> OPERATIONAL SETTINGS
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Authoritative meal cutoff times and delivery windows. Enforced at runtime for customer actions and snapshotted into generated orders.
            </p>
          </div>

          {/* Cutoff Times */}
          <div>
            <h3 className="text-sm font-bold text-primary mb-1 flex items-center gap-2">
              <Clock size={16} className="text-rose-500" /> Cutoff Times (24h)
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Modifications, cancellations, and add-on requests for today must occur strictly before these times.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-background p-4 rounded-xl border border-primary/10">
                <Input
                  id="cutoff-breakfast"
                  label="Breakfast Cutoff"
                  type="time"
                  error={errors.operations?.cancellationCutoffTimes?.breakfast?.message}
                  {...register("operations.cancellationCutoffTimes.breakfast")}
                />
              </div>
              <div className="bg-background p-4 rounded-xl border border-primary/10">
                <Input
                  id="cutoff-lunch"
                  label="Lunch Cutoff"
                  type="time"
                  error={errors.operations?.cancellationCutoffTimes?.lunch?.message}
                  {...register("operations.cancellationCutoffTimes.lunch")}
                />
              </div>
              <div className="bg-background p-4 rounded-xl border border-primary/10">
                <Input
                  id="cutoff-dinner"
                  label="Dinner Cutoff"
                  type="time"
                  error={errors.operations?.cancellationCutoffTimes?.dinner?.message}
                  {...register("operations.cancellationCutoffTimes.dinner")}
                />
              </div>
            </div>
          </div>

          {/* Delivery Windows */}
          <div>
            <h3 className="text-sm font-bold text-primary mb-1 flex items-center gap-2">
              <Truck size={16} className="text-gold" /> Delivery Windows (24h)
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Delivery timeframe windows snapshotted into daily generated orders at order creation.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
                <h4 className="font-bold text-primary text-base border-b border-primary/10 pb-2">
                  Breakfast
                </h4>
                <div className="space-y-3">
                  <Input
                    id="delivery-breakfast-start"
                    label="Start Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.breakfast?.start?.message || (errors.operations?.deliveryWindows?.breakfast as any)?.message}
                    {...register("operations.deliveryWindows.breakfast.start")}
                  />
                  <Input
                    id="delivery-breakfast-end"
                    label="End Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.breakfast?.end?.message}
                    {...register("operations.deliveryWindows.breakfast.end")}
                  />
                </div>
              </div>
              <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
                <h4 className="font-bold text-primary text-base border-b border-primary/10 pb-2">
                  Lunch
                </h4>
                <div className="space-y-3">
                  <Input
                    id="delivery-lunch-start"
                    label="Start Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.lunch?.start?.message || (errors.operations?.deliveryWindows?.lunch as any)?.message}
                    {...register("operations.deliveryWindows.lunch.start")}
                  />
                  <Input
                    id="delivery-lunch-end"
                    label="End Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.lunch?.end?.message}
                    {...register("operations.deliveryWindows.lunch.end")}
                  />
                </div>
              </div>
              <div className="space-y-4 bg-background p-5 rounded-2xl border border-primary/10 shadow-sm">
                <h4 className="font-bold text-primary text-base border-b border-primary/10 pb-2">
                  Dinner
                </h4>
                <div className="space-y-3">
                  <Input
                    id="delivery-dinner-start"
                    label="Start Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.dinner?.start?.message || (errors.operations?.deliveryWindows?.dinner as any)?.message}
                    {...register("operations.deliveryWindows.dinner.start")}
                  />
                  <Input
                    id="delivery-dinner-end"
                    label="End Time"
                    type="time"
                    error={errors.operations?.deliveryWindows?.dinner?.end?.message}
                    {...register("operations.deliveryWindows.dinner.end")}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* General Operations */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Clock size={24} className="text-gold" /> General Operations
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Input
              id="operations-orderCutoffTime"
              label="Order Cutoff Time (24h)"
              type="time"
              {...register("operations.orderCutoffTime")}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="operations-kitchenTimings-start"
                label="Kitchen Start"
                type="time"
                {...register("operations.kitchenTimings.start")}
              />
              <Input
                id="operations-kitchenTimings-end"
                label="Kitchen End"
                type="time"
                {...register("operations.kitchenTimings.end")}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                id="operations-businessHolidays"
                label="Business Holidays (YYYY-MM-DD, comma separated)"
                placeholder="2025-01-01, 2025-08-15"
                {...register("operations.businessHolidays")}
              />
            </div>
          </div>
        </Card>

        {/* Payroll Settings */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <IndianRupee size={24} className="text-gold" /> Payroll
            Configuration
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <Input
              label="Standard Working Days / Mo"
              type="number"
              {...register("payroll.standardWorkingDays")}
            />
            <Input
              label="Standard Working Hours / Day"
              type="number"
              {...register("payroll.standardWorkingHours")}
            />
            <Input
              label="Tax Deduction (%)"
              type="number"
              step="0.1"
              {...register("payroll.taxPercentage")}
            />
            <Input
              label="Leave Deduction Multiplier"
              type="number"
              step="0.1"
              {...register("payroll.leaveDeductionMultiplier")}
            />
          </div>
        </Card>

        {/* Manual Operations */}
        <Card className="p-6 space-y-6 shadow-sm border-primary/20">
          <h2 className="text-xl font-bold text-primary flex items-center gap-3 border-b border-primary/10 pb-4 font-display">
            <Play size={24} className="text-emerald-600" /> Manual Operations
            (Spark Plan)
          </h2>
          <div className="grid md:grid-cols-1 gap-4">
            <div className="space-y-3 bg-primary/5 p-5 rounded-2xl border border-primary/10">
              <h3 className="font-bold text-primary text-base">
                Seed Production Data
              </h3>
              <p className="text-sm font-medium text-text-muted">
                Initializes the database with default Meal Plans and Business
                Settings. Run this once on a fresh deployment to set up the
                system.
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={seedData}
                isLoading={isSeeding}
                className="mt-4 !bg-emerald-600 hover:!bg-emerald-700 shadow-md"
              >
                Seed Data
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-primary/10 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] z-40 transition-all">
        <div className="max-w-4xl mx-auto flex justify-end">
          <Button
            type="submit"
            variant="primary"
            form="settings-form"
            isLoading={updateMutation.isPending}
            size="lg"
            className="shadow-lg px-8 py-4 text-base"
          >
            <Save size={20} className="mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
