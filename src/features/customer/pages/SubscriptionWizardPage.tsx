import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMealPlans } from '../hooks/useMealPlans';
import { useCustomerAddresses } from '../hooks/useCustomerAddresses';
import { subscriptionService } from '@/shared/services/business/subscriptionService';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMySubscription } from '../hooks/useMySubscription';
import { notifySubscriptionCreated } from '@/shared/services/firestore/notificationService';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  Utensils,
  Calendar,
  CheckCircle,
  Plus,
  AlertCircle
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useBusinessSettings } from '@/features/admin/hooks/useSettings';
import { ManualPaymentPanel } from '../components/ManualPaymentPanel';

// Zod Schema for Address
const addressFormSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g., Home, Office)').max(50),
  line1: z.string().min(5, 'Address line 1 must be at least 5 characters').max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be exactly 6 digits'),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

export function SubscriptionWizardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();

  const { data: plans, isLoading: isPlansLoading, error: plansError, refetch } = useMealPlans();
  const { addresses, addAddress, isAdding } = useCustomerAddresses();
  const { data: settings, isLoading: isSettingsLoading } = useBusinessSettings();
  const { data: activeSub, isLoading: isSubLoading } = useMySubscription();

  // Selected Plan ID
  const initialPlanId = location.state?.planId || plans?.[0]?.id || '';
  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlanId);
  const plan = plans?.find((p) => p.id === (selectedPlanId || initialPlanId));

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<string | null>(null);

  // Form states
  const [lunchOptionId, setLunchOptionId] = useState<string>('');
  const [dinnerOptionId, setDinnerOptionId] = useState<string>('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // Tomorrow as default
  );

  // Address creation UI state
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      label: 'Home',
      city: 'Mysuru',
      state: 'Karnataka',
    },
  });

  if (isPlansLoading || isSettingsLoading || isSubLoading) {
    return <LoadingScreen />;
  }

  if (activeSub && activeSub.status !== 'cancelled' && activeSub.status !== 'expired') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <ErrorState
          title="Active Subscription Exists"
          description="You already have an active or pending meal plan. You must cancel your current plan before switching to a new one."
          onRetry={() => navigate('/customer/dashboard')}
        />
      </div>
    );
  }

  if (plansError || !plans || plans.length === 0) {
    return (
      <ErrorState
        title="Could not load plan details"
        description="We couldn't retrieve the plans. Please head back and choose a plan."
        onRetry={refetch}
      />
    );
  }

  const handleSelectPlan = (id: string) => {
    setSelectedPlanId(id);
    const newPlan = plans?.find((p) => p.id === id);
    if (newPlan) {
      // Default to first option of the new plan
      const lunchSlot = newPlan.mealSlots?.find((s) => s.mealType === 'lunch');
      const dinnerSlot = newPlan.mealSlots?.find((s) => s.mealType === 'dinner');
      if (lunchSlot?.options?.[0]) setLunchOptionId(lunchSlot.options[0].id);
      if (dinnerSlot?.options?.[0]) setDinnerOptionId(dinnerSlot.options[0].id);
    }
  };

  // Initialize selected options once plan is loaded
  if (plan && !lunchOptionId && !dinnerOptionId) {
    const lunchSlot = plan?.mealSlots?.find((s) => s.mealType === 'lunch');
    const dinnerSlot = plan?.mealSlots?.find((s) => s.mealType === 'dinner');
    if (lunchSlot?.options?.[0]) setLunchOptionId(lunchSlot.options[0].id);
    if (dinnerSlot?.options?.[0]) setDinnerOptionId(dinnerSlot.options[0].id);
  }

  // Set default selected address once addresses loaded
  if (addresses.length > 0 && !selectedAddressId) {
    const defaultAddr = addresses?.find((a) => a.isDefault);
    setSelectedAddressId(defaultAddr?.id || addresses[0].id);
  }

  // Handle address form submit
  const onAddressSubmit = async (data: AddressFormValues) => {
    try {
      const newAddr = await addAddress({
        ...data,
        isDefault: addresses.length === 0, // default if first address
        lat: null,
        lng: null,
      });
      setSelectedAddressId(newAddr.id);
      setShowAddressForm(false);
      reset();
    } catch (err) {
      console.error('Failed to save address:', err);
    }
  };

  // Submit Draft
  const handleConfirmSubscription = async () => {
    if (!plan || !selectedAddressId) return;

    setSubmittingDraft(true);
    setSubmissionError(null);

    const mealPreferences = [
      { mealType: 'breakfast' as const, selectedOptionId: null },
      { mealType: 'lunch' as const, selectedOptionId: lunchOptionId },
      { mealType: 'dinner' as const, selectedOptionId: dinnerOptionId },
    ];

    try {
      // Phase 3: Create subscription via Business Service
      const subscriptionId = await subscriptionService.createSubscription(
        firebaseUser!.uid,
        plan.id,
        plan.tier,
        quantity,
        plan.pricePerDay,
        mealPreferences,
        startDate,
        selectedAddressId
      );

      // Notify the customer their subscription draft is created.
      // Fire-and-forget — a failed notification must not block the redirect.
      notifySubscriptionCreated(firebaseUser!.uid, subscriptionId, plan.tier)
        .catch((err) => console.error('[SubscriptionWizard] notification failed:', err));

      // Save ID to state for Step 4
      setCreatedSubscriptionId(subscriptionId);

      // Invalidate queries so subscription pages refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
      });

      // Proceed to Step 4 (Payment) instead of redirecting
      setStep(4);
    } catch (err: unknown) {
      console.error('Error creating subscription draft:', err);
      setSubmissionError((err as Error).message || 'An unexpected error occurred. Please verify your address or pincode.');
    } finally {
      setSubmittingDraft(false);
    }
  };

  const currentAddress = addresses?.find((a) => a.id === selectedAddressId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Stepper Header */}
      <div className="flex justify-between items-center mb-8 border-b border-rice-300 pb-4">
        <div>
          <h1 className="text-2xl font-serif text-amber-950 font-bold">Subscribe to {plan?.name}</h1>
          <p className="text-ink-500 text-xs font-sans mt-0.5">Step {step} of 3</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-sans font-semibold text-xs transition-colors ${step >= 1 ? 'bg-emerald-600 text-stone-50' : 'bg-rice-200 text-ink-600'}`}>1</div>
          <div className="w-8 h-0.5 bg-rice-200"></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-sans font-semibold text-xs transition-colors ${step >= 2 ? 'bg-emerald-600 text-stone-50' : 'bg-rice-200 text-ink-600'}`}>2</div>
          <div className="w-8 h-0.5 bg-rice-200"></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-sans font-semibold text-xs transition-colors ${step >= 3 ? 'bg-emerald-600 text-stone-50' : 'bg-rice-200 text-ink-600'}`}>3</div>
          <div className="w-8 h-0.5 bg-rice-200"></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-sans font-semibold text-xs transition-colors ${step >= 4 ? 'bg-emerald-600 text-stone-50' : 'bg-rice-200 text-ink-600'}`}>4</div>
        </div>
      </div>

      {submissionError && (
        <Card className="border-2 border-red-500 bg-red-50 p-4 mb-6 flex gap-3 items-start">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-red-950 font-bold font-sans text-sm">Subscription setup failed</h4>
            <p className="text-red-800 font-sans text-xs mt-1">{submissionError}</p>
          </div>
        </Card>
      )}

      {/* STEP 1: Meal Slots preferences */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-rice-50 p-4 rounded-xl border border-rice-300/80 mb-6">
            <h3 className="text-sm font-sans font-bold text-ink-800 mb-2">Switch Plan Tier:</h3>
            <div className="flex gap-3">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPlan(p.id)}
                  className={`px-4 py-2 text-xs font-sans font-semibold rounded-lg border transition-all ${
                    p.id === selectedPlanId
                      ? 'bg-emerald-600 text-stone-50 border-emerald-600'
                      : 'bg-rice-100 text-ink-600 border-rice-300 hover:bg-rice-200'
                  }`}
                >
                  {p.name} (₹{p.pricePerDay}/day)
                </button>
              ))}
            </div>
          </div>

          <h2 className="text-lg font-serif font-bold text-ink-900 flex items-center gap-2">
            <Utensils className="text-emerald-600" size={20} /> Choose your daily meal preferences
          </h2>
          <p className="text-ink-500 text-xs font-sans -mt-3 mb-6">
            Choose what you'd like to receive for lunch and dinner. You can swap this weekly. Breakfast is fixed to the daily rotating menu.
          </p>

          <div className="space-y-6">
            {/* Breakfast: Fixed */}
            <Card className="p-4 border-rice-300 bg-rice-50/50 flex justify-between items-center opacity-85">
              <div>
                <h4 className="font-sans font-bold text-ink-800 text-sm">Breakfast Slot</h4>
                <p className="text-ink-500 text-xs mt-1">Daily rotating menu (Idli, Shavige Bath, Khara Bath, etc.)</p>
              </div>
              <span className="text-ink-400 font-sans text-xs italic">Fixed menu</span>
            </Card>

            {/* Lunch Selection */}
            {plan?.mealSlots?.find((s) => s.mealType === 'lunch')?.options.map((option) => (
              <label
                key={option.id}
                className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  lunchOptionId === option.id
                    ? 'border-emerald-600 bg-emerald-50/20'
                    : 'border-rice-300 hover:border-ink-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="lunch"
                    checked={lunchOptionId === option.id}
                    onChange={() => setLunchOptionId(option.id)}
                    className="mt-1 accent-emerald-600"
                  />
                  <div>
                    <h4 className="font-sans font-bold text-ink-900 text-sm">Lunch: {option.label}</h4>
                    <p className="text-ink-500 text-xs mt-1">Includes: {option.items.join(', ')}</p>
                  </div>
                </div>
              </label>
            ))}

            {/* Dinner Selection */}
            <div className="border-t border-rice-300 pt-6">
              <h3 className="text-ink-900 font-bold font-sans text-sm mb-4">Choose Dinner Option:</h3>
              <div className="space-y-3">
                {plan?.mealSlots?.find((s) => s.mealType === 'dinner')?.options.map((option) => (
                  <label
                    key={option.id}
                    className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      dinnerOptionId === option.id
                        ? 'border-emerald-600 bg-emerald-50/20'
                        : 'border-rice-300 hover:border-ink-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="dinner"
                        checked={dinnerOptionId === option.id}
                        onChange={() => setDinnerOptionId(option.id)}
                        className="mt-1 accent-emerald-600"
                      />
                      <div>
                        <h4 className="font-sans font-bold text-ink-900 text-sm">Dinner: {option.label}</h4>
                        <p className="text-ink-500 text-xs mt-1">Includes: {option.items.join(', ')}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-rice-300 mt-8">
            <Button onClick={() => setStep(2)} className="flex items-center gap-2 font-sans font-semibold">
              Continue to Address <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Address Selection */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-lg font-serif font-bold text-ink-900 flex items-center gap-2">
            <MapPin className="text-emerald-600" size={20} /> Choose Delivery Address
          </h2>
          <p className="text-ink-500 text-xs font-sans -mt-3 mb-6">
            We deliver three times daily. Choose where you want your meals dropped off. Pincode must be in our coverage zone.
          </p>

          {!showAddressForm ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {addresses.map((addr) => (
                  <Card
                    key={addr.id}
                    onClick={() => setSelectedAddressId(addr.id)}
                    className={`p-4 cursor-pointer border-2 transition-all hover:border-emerald-500/70 flex flex-col justify-between ${
                      selectedAddressId === addr.id
                        ? 'border-emerald-600 bg-emerald-50/10'
                        : 'border-rice-300'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-sans font-bold text-ink-800 text-sm">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="text-[10px] bg-rice-100 text-ink-500 px-1.5 py-0.5 rounded font-sans uppercase font-bold">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-ink-600 text-xs font-sans line-clamp-2">{addr.line1}</p>
                      {addr.line2 && <p className="text-ink-600 text-xs font-sans line-clamp-1">{addr.line2}</p>}
                      <p className="text-ink-700 text-xs font-semibold font-sans mt-2">
                        {addr.city}, {addr.pincode}
                      </p>
                    </div>
                  </Card>
                ))}

                {/* Add new address button */}
                <Card
                  onClick={() => setShowAddressForm(true)}
                  className="p-4 cursor-pointer border-dashed border-2 border-ink-400 hover:border-emerald-600 bg-rice-50/50 flex flex-col items-center justify-center text-ink-500 hover:text-emerald-600 gap-2 h-full min-h-[120px]"
                >
                  <Plus size={24} />
                  <span className="font-sans font-semibold text-xs uppercase tracking-wider">Add New Address</span>
                </Card>
              </div>

              {addresses.length === 0 && (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-sans">
                  You have no saved addresses yet. Please add a delivery address to proceed.
                </p>
              )}
            </div>
          ) : (
            /* Add Address Form */
            <form onSubmit={handleSubmit(onAddressSubmit)} className="space-y-4 bg-rice-50 p-6 rounded-xl border border-rice-300">
              <h3 className="font-serif font-bold text-ink-900 text-base mb-2">Add New Address</h3>

              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Address Label (e.g. Home, Office)"
                  placeholder="Home"
                  {...register('label')}
                  error={errors.label?.message}
                />
                <Input
                  label="Pincode (6 digits)"
                  placeholder="570001"
                  {...register('pincode')}
                  error={errors.pincode?.message}
                />
              </div>

              <Input
                label="Street Address / House No / Apartment"
                placeholder="No. 12, 3rd Cross, Gokulam"
                {...register('line1')}
                error={errors.line1?.message}
              />

              <Input
                label="Landmark / Area (Optional)"
                placeholder="Near Ganapathi Temple"
                {...register('line2')}
                error={errors.line2?.message}
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="City"
                  {...register('city')}
                  error={errors.city?.message}
                  disabled
                />
                <Input
                  label="State"
                  {...register('state')}
                  error={errors.state?.message}
                  disabled
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-rice-300">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddressForm(false);
                    reset();
                  }}
                  className="font-sans font-semibold"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isAdding} className="font-sans font-semibold">
                  {isAdding ? 'Saving...' : 'Save Address'}
                </Button>
              </div>
            </form>
          )}

          <div className="flex justify-between pt-6 border-t border-rice-300 mt-8">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex items-center gap-2 font-sans font-semibold">
              <ArrowLeft size={16} /> Back to Preferences
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!selectedAddressId || showAddressForm}
              className="flex items-center gap-2 font-sans font-semibold"
            >
              Review Order <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Review and Confirm */}
      {step === 3 && plan && (
        <div className="space-y-6">
          <h2 className="text-lg font-serif font-bold text-ink-900 flex items-center gap-2">
            <CheckCircle className="text-emerald-600" size={20} /> Review your Subscription Details
          </h2>
          <p className="text-ink-500 text-xs font-sans -mt-3 mb-6">
            Verify your choices. You are creating a recurring monthly subscription draft. Price is locked in.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Left 2 Columns: Summary */}
            <div className="md:col-span-2 space-y-4">
              {/* Preferences Summary */}
              <Card className="p-4 border-rice-300">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-sans font-bold text-ink-800 text-sm">Selected Preferences</h3>
                  <div className="flex items-center gap-2 bg-rice-100 rounded-lg p-1 border border-rice-300">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-ink-700 font-bold"
                    >-</button>
                    <span className="text-xs font-bold w-12 text-center">{quantity} {quantity === 1 ? 'Person' : 'People'}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(10, q + 1))}
                      className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-ink-700 font-bold"
                    >+</button>
                  </div>
                </div>
                <div className="space-y-2 text-ink-600 text-xs font-sans">
                  <div className="flex justify-between">
                    <span>Plan Tier:</span>
                    <span className="font-semibold text-ink-900 capitalize">{plan.tier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Breakfast:</span>
                    <span className="font-semibold text-ink-900">Fixed rotating menu</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lunch:</span>
                    <span className="font-semibold text-ink-900">
                      {plan?.mealSlots?.find((s) => s.mealType === 'lunch')?.options.find((o) => o.id === lunchOptionId)?.label || 'Not Chosen'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dinner:</span>
                    <span className="font-semibold text-ink-900">
                      {plan?.mealSlots?.find((s) => s.mealType === 'dinner')?.options.find((o) => o.id === dinnerOptionId)?.label || 'Not Chosen'}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Delivery Address Summary */}
              <Card className="p-4 border-rice-300">
                <h3 className="font-sans font-bold text-ink-800 text-sm mb-3">Delivery Address</h3>
                {currentAddress ? (
                  <div className="text-xs text-ink-600 font-sans">
                    <span className="font-bold text-ink-900 px-1.5 py-0.5 bg-rice-100 rounded text-[10px] uppercase">
                      {currentAddress.label}
                    </span>
                    <p className="mt-2 text-ink-800 font-medium">{currentAddress.line1}</p>
                    {currentAddress.line2 && <p className="text-ink-700">{currentAddress.line2}</p>}
                    <p className="text-ink-700">
                      {currentAddress.city}, {currentAddress.state} - {currentAddress.pincode}
                    </p>
                  </div>
                ) : (
                  <span className="text-xs text-rose-600 font-semibold font-sans">No Address Selected!</span>
                )}
              </Card>

              {/* Start Date */}
              <Card className="p-4 border-rice-300">
                <h3 className="font-sans font-bold text-ink-800 text-sm mb-3">Select Start Date</h3>
                <div className="flex items-center gap-3">
                  <Calendar className="text-ink-400" size={18} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} // tomorrow
                    className="border border-ink-400 rounded-md p-1.5 text-xs font-sans"
                  />
                </div>
                <p className="text-[10px] text-ink-400 font-sans mt-2">
                  First delivery will occur on the morning of the selected date.
                </p>
              </Card>
            </div>

            {/* Right Column: Price summary */}
            <div>
              <Card className="p-5 border-rice-300 bg-rice-50/50">
                <h3 className="font-sans font-bold text-ink-900 text-sm mb-3 border-b border-rice-300 pb-2">
                  Pricing Summary
                </h3>
                <div className="space-y-2 text-ink-600 text-xs font-sans mb-4">
                  <div className="flex justify-between">
                    <span>Base daily rate:</span>
                    <span className="font-semibold text-ink-900">₹{plan.pricePerDay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quantity:</span>
                    <span className="font-semibold text-ink-900">{quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total daily rate:</span>
                    <span className="font-semibold text-ink-900">₹{plan.pricePerDay * quantity}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-rice-300/60">
                    <span>Deliveries per day:</span>
                    <span className="font-semibold text-ink-900">3 deliveries</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Billing terms:</span>
                    <span className="font-semibold text-ink-900">Monthly</span>
                  </div>
                </div>
                <div className="border-t border-rice-300 pt-3 flex justify-between items-center font-bold text-stone-950 text-sm mb-2">
                  <span>Initial Security Deposit:</span>
                  <span className="text-lg">₹{settings?.pricing.securityDepositAmount || 1000}</span>
                </div>
                <p className="text-[10px] text-ink-500 font-sans mb-6">
                  * Monthly bills will be generated pro-rata at the end of each month based on the days you were subscribed. This security deposit is held on your account and refunded upon cancellation.
                </p>

                <Button
                  onClick={handleConfirmSubscription}
                  disabled={submittingDraft || !selectedAddressId}
                  className="w-full font-sans font-semibold uppercase tracking-wider text-xs py-3"
                >
                  {submittingDraft ? 'Creating Draft...' : 'Confirm & Proceed'}
                </Button>
              </Card>
            </div>
          </div>

          <div className="flex justify-between pt-6 border-t border-rice-300 mt-8">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex items-center gap-2 font-sans font-semibold">
              <ArrowLeft size={16} /> Back to Address
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Payment */}
      {step === 4 && createdSubscriptionId && (
        <div className="space-y-6">
          <h2 className="text-lg font-serif font-bold text-ink-900 flex items-center gap-2 mb-4">
            <CheckCircle className="text-emerald-600" size={20} /> Subscription Draft Created!
          </h2>
          <p className="text-ink-600 text-sm font-sans mb-6">
            Your subscription has been reserved. To complete your setup and begin meal deliveries, please pay the initial security deposit below.
          </p>

          <ManualPaymentPanel
            subscriptionId={createdSubscriptionId}
            amount={settings?.pricing.securityDepositAmount || 1000}
            onSuccess={() => {
              navigate('/customer/subscription', { state: { justCreated: true } });
            }}
          />
        </div>
      )}
    </div>
  );
}
