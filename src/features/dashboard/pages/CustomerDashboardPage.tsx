import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMySubscription } from '@/features/customer/hooks/useMySubscription';
import { useMealPlans } from '@/features/customer/hooks/useMealPlans';
import { useCustomerAddresses } from '@/features/customer/hooks/useCustomerAddresses';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { AddressPicker, type PickedAddress } from '@/features/customer/components/AddressPicker';
import {
  UtensilsCrossed,
  MapPin,
  Plus,
  Trash2,
  Calendar,
  ExternalLink,
  Info,
  MessageSquareWarning
} from 'lucide-react';
import { FeedbackModal } from '@/features/customer/components/FeedbackModal';

const addressFormSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g., Home, Office)').max(50),
  line1: z.string().min(5, 'Address line 1 must be at least 5 characters').max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be exactly 6 digits'),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

export function CustomerDashboardPage() {
  const navigate = useNavigate();
  const { data: subscription, isLoading: isSubLoading, error: subError, refetch: refetchSub } = useMySubscription();
  const { data: plans, isLoading: isPlansLoading, error: plansError, refetch: refetchPlans } = useMealPlans();
  const {
    addresses,
    defaultAddressId,
    addAddress,
    isAdding,
    deleteAddress,
    isDeleting,
    setDefaultAddress,
    isSettingDefault
  } = useCustomerAddresses();

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const skipDay = require('@/features/customer/hooks/useMySubscription').useSkipDay();
  const { firebaseUser } = require('@/features/auth/hooks/useAuth').useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      label: 'Home',
      city: 'Mysuru',
      state: 'Karnataka',
    },
  });

  // Track geocoords picked from AddressPicker (not stored in form)
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const handleAddressPicked = (picked: PickedAddress) => {
    setValue('line1', picked.line1, { shouldValidate: true });
    if (picked.line2) setValue('line2', picked.line2, { shouldValidate: true });
    setValue('city', picked.city || 'Mysuru', { shouldValidate: true });
    setValue('state', picked.state || 'Karnataka', { shouldValidate: true });
    if (picked.pincode) setValue('pincode', picked.pincode, { shouldValidate: true });
    setPickedCoords({ lat: picked.lat, lng: picked.lng });
  };

  const isLoading = isSubLoading || isPlansLoading;
  const hasError = subError || plansError;

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (hasError) {
    return (
      <ErrorState
        title="Could not load your dashboard"
        description="We had trouble retrieving your subscription details. Please try again."
        onRetry={() => {
          refetchSub();
          refetchPlans();
        }}
      />
    );
  }

  const selectedPlan = plans?.find((p) => p.id === subscription?.planId);
  const activeAddress = addresses?.find((a) => a.id === subscription?.deliveryAddressId);

  const onAddressSubmit = async (data: AddressFormValues) => {
    setAddressError(null);
    try {
      await addAddress({
        ...data,
        isDefault: addresses.length === 0,
        lat: pickedCoords?.lat ?? null,
        lng: pickedCoords?.lng ?? null,
      });
      setShowAddressForm(false);
      setPickedCoords(null);
      reset();
    } catch (err: any) {
      console.error('Error adding address:', err);
      setAddressError(err.message || 'Could not add address. Please check inputs.');
    }
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'neutral' | 'danger' => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending_payment':
        return 'warning';
      case 'paused':
        return 'neutral';
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Welcome & Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-serif text-amber-950 font-bold">Customer Dashboard</h1>
        <p className="text-ink-600 font-sans text-sm mt-1">
          Manage your daily meals, subscription plans, and delivery options here.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Columns: Subscription Status & Summary */}
        <div className="md:col-span-2 space-y-8">
          {/* Live Subscription Card */}
          <Card className="p-6 md:p-8 border-rice-300 shadow-sm relative overflow-hidden bg-rice-50/20">
            {subscription && (
              <div className="absolute top-0 right-0 left-0 bg-emerald-700/5 h-1"></div>
            )}
            <h2 className="text-xl font-serif font-bold text-ink-900 mb-6 flex items-center gap-2.5">
              <UtensilsCrossed size={20} className="text-emerald-700" /> Live Meal Subscription
            </h2>

            {subscription ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-rice-50 p-4 rounded-xl border border-rice-200">
                  <div>
                    <h3 className="font-sans font-bold text-ink-900 text-base">
                      {selectedPlan?.name || 'Loading plan details...'}
                      <span className="text-sm text-emerald-700 ml-2 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {subscription.quantity || 1} {subscription.quantity === 1 ? 'Person' : 'People'}
                      </span>
                    </h3>
                    <p className="text-ink-500 text-xs mt-1">
                      Post-paid monthly billing • ₹{subscription.pricePerDaySnapshot * (subscription.quantity || 1)}/day total
                    </p>
                  </div>
                  <div>
                    <Badge tone={getStatusBadgeVariant(subscription.status)} className="capitalize font-sans px-3 py-1 font-semibold text-xs">
                      {subscription.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6 font-sans text-xs">
                  {/* Next Delivery info */}
                  <div className="space-y-2">
                    <span className="text-ink-400 font-bold uppercase tracking-wider block text-[10px]">
                      Delivery Schedule
                    </span>
                    <div className="flex items-start gap-2.5 text-ink-700">
                      <Calendar size={16} className="text-ink-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-ink-900">Starts: {subscription.startDate}</p>
                        <p className="text-ink-500 mt-0.5">3 deliveries daily (Breakfast, Lunch, Dinner)</p>
                      </div>
                    </div>
                  </div>

                  {/* Drop-off Address info */}
                  <div className="space-y-2">
                    <span className="text-ink-400 font-bold uppercase tracking-wider block text-[10px]">
                      Drop-off Address
                    </span>
                    <div className="flex items-start gap-2.5 text-ink-700">
                      <MapPin size={16} className="text-ink-400 shrink-0 mt-0.5" />
                      <div>
                        {activeAddress ? (
                          <>
                            <p className="font-semibold text-ink-900">{activeAddress.label}</p>
                            <p className="text-ink-500 mt-0.5 line-clamp-1">{activeAddress.line1}</p>
                          </>
                        ) : (
                          <p className="text-rose-600 font-medium">Address details missing</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-rice-200 pt-5 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowFeedbackModal(true)}
                    className="text-amber-700 border-amber-200 hover:bg-amber-50"
                  >
                    Report Issue <MessageSquareWarning size={16} className="ml-2" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowPauseModal(true)}
                    className="text-ink-700 border-rice-300 hover:bg-rice-100"
                  >
                    Pause Delivery <Calendar size={16} className="ml-2" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate('/customer/subscription')}
                  >
                    Manage Subscription <ExternalLink size={16} className="ml-2" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-ink-500 font-sans text-sm mb-5">
                  You do not have an active breakfast, lunch, or dinner meal subscription yet.
                </p>
                <div className="flex gap-4 justify-center items-center">
                  <Button
                    onClick={() => navigate('/customer/plans')}
                    className="font-sans font-semibold uppercase tracking-wider text-xs px-6"
                  >
                    Browse Meal Plans
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowTrialModal(true)}
                    className="font-sans font-semibold uppercase tracking-wider text-xs px-6 bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                  >
                    Book a Trial Meal
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Quick info panel */}
          <Card className="p-5 border-rice-300 bg-amber-50/20 flex gap-3.5 items-start">
            <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div className="font-sans text-ink-700 text-xs">
              <h4 className="font-bold text-amber-950">Daily Delivery Times:</h4>
              <ul className="list-disc list-inside mt-2 space-y-1 pl-1 text-ink-600">
                <li><strong>Breakfast:</strong> 07:00 AM - 09:00 AM</li>
                <li><strong>Lunch:</strong> 12:30 PM - 02:30 PM</li>
                <li><strong>Dinner:</strong> 07:00 PM - 09:00 PM</li>
              </ul>
              <p className="text-ink-400 mt-3 text-[10px]">
                To pause or skip deliveries for a single day, please visit your subscription details page before 10:00 PM the night prior.
              </p>
            </div>
          </Card>
        </div>

        {/* Right 1 Column: Saved Addresses */}
        <div className="space-y-6">
          <Card className="p-6 border-rice-300">
            <h2 className="text-lg font-serif font-bold text-ink-900 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MapPin size={18} className="text-emerald-700" /> Saved Addresses
              </span>
              {!showAddressForm && (
                <button
                  onClick={() => setShowAddressForm(true)}
                  className="text-emerald-700 hover:text-emerald-800 text-xs font-sans font-bold flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </h2>

            {addressError && (
              <div className="p-2.5 mb-4 text-xs font-sans bg-red-50 text-red-700 rounded border border-red-200">
                {addressError}
              </div>
            )}

            {showAddressForm ? (
              /* Inline Address Form */
              <form onSubmit={handleSubmit(onAddressSubmit)} className="space-y-3 bg-rice-50 p-4 rounded-xl border border-rice-300">
                <h3 className="font-sans font-bold text-ink-800 text-xs uppercase tracking-wider mb-2">New Address</h3>

                {/* ── Zomato-style location picker ── */}
                <AddressPicker onPick={handleAddressPicked} />

                <div className="pt-1 border-t border-rice-200">
                  <p className="text-[10px] text-ink-400 font-sans mb-3">Confirm or edit the auto-filled details below</p>

                  <Input
                    label="Label (e.g. Home, Office)"
                    placeholder="Home"
                    {...register('label')}
                    error={errors.label?.message}
                    className="py-1 text-xs"
                  />

                  <div className="mt-2">
                    <Input
                      label="Street / House Number"
                      placeholder="123 Main St"
                      {...register('line1')}
                      error={errors.line1?.message}
                      className="py-1 text-xs"
                    />
                  </div>

                  <div className="mt-2">
                    <Input
                      label="Area / Landmark (Optional)"
                      placeholder="Opposite Park"
                      {...register('line2')}
                      error={errors.line2?.message}
                      className="py-1 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input
                      label="Pincode"
                      placeholder="570001"
                      {...register('pincode')}
                      error={errors.pincode?.message}
                      className="py-1 text-xs"
                    />
                    <Input
                      label="City"
                      {...register('city')}
                      error={errors.city?.message}
                      disabled
                      className="py-1 text-xs bg-rice-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-rice-300 mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowAddressForm(false);
                      setPickedCoords(null);
                      reset();
                    }}
                    className="py-1 px-3 text-xs font-sans font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isAdding}
                    className="py-1 px-3 text-xs font-sans font-semibold"
                  >
                    {isAdding ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Saved Address Cards */
              <div className="space-y-3.5">
                {addresses.length === 0 ? (
                  <p className="text-ink-400 font-sans text-xs italic py-4 text-center">
                    No saved addresses found. Add one to get started.
                  </p>
                ) : (
                  addresses.map((addr) => {
                    const isDefault = addr.id === defaultAddressId;
                    return (
                      <div
                        key={addr.id}
                        className={`p-3 rounded-lg border font-sans text-xs flex justify-between items-start ${
                          isDefault ? 'border-emerald-600 bg-emerald-50/5' : 'border-rice-300'
                        }`}
                      >
                        <div className="space-y-1 select-none pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-ink-800">{addr.label}</span>
                            {isDefault ? (
                              <span className="text-[9px] bg-emerald-600 text-stone-50 px-1 py-0.2 rounded font-sans font-bold uppercase tracking-wider">
                                Default
                              </span>
                            ) : (
                              <button
                                onClick={() => setDefaultAddress(addr.id)}
                                disabled={isSettingDefault}
                                className="text-ink-400 hover:text-emerald-700 text-[10px] underline"
                              >
                                Set Default
                              </button>
                            )}
                          </div>
                          <p className="text-ink-600 line-clamp-1">{addr.line1}</p>
                          {addr.line2 && <p className="text-ink-500 line-clamp-1">{addr.line2}</p>}
                          <p className="text-ink-700 font-medium">
                            {addr.city} - {addr.pincode}
                          </p>
                        </div>

                        <button
                          onClick={() => deleteAddress(addr.id)}
                          disabled={isDeleting}
                          className="text-ink-400 hover:text-rose-600 p-1 shrink-0 transition-colors"
                          title="Delete address"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        </div>
        <FeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
        />

        {showPauseModal && subscription && (
          <PauseDeliveryModal 
            subscription={subscription} 
            onClose={() => setShowPauseModal(false)} 
            skipDay={skipDay}
          />
        )}

        {showTrialModal && (
          <TrialMealModal
            onClose={() => setShowTrialModal(false)}
            uid={firebaseUser?.uid}
            addresses={addresses}
            plans={plans}
          />
        )}
      </div>
    </div>
  );
}

function TrialMealModal({ onClose, uid, addresses, plans }: any) {
  const [addressId, setAddressId] = useState(addresses?.[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleBook = async () => {
    if (!addressId || !uid) return;
    setLoading(true);
    try {
      const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
      const { db } = require('@/shared/lib/firebase');
      
      const orderId = crypto.randomUUID();
      const plan = plans?.[0]; // Default to first plan for trial pricing

      await setDoc(doc(db, 'orders', orderId), {
        id: orderId,
        source: 'one_time',
        customerId: uid,
        subscriptionId: null,
        planTier: plan?.tier || 'basic',
        mealType: 'lunch', // Default trial is lunch
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
        itemsLabel: 'Trial Meal (Lunch)',
        selectedOptionId: null,
        price: plan?.pricePerDay ? Math.round(plan.pricePerDay / 3) : 100, // Roughly 1/3rd of daily price
        currency: 'INR',
        status: 'scheduled',
        deliveryAddressId: addressId,
        zoneId: null,
        kitchenId: null,
        deliveryPartnerId: null,
        deliveryWindow: null,
        paymentId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to book trial meal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">Book Trial Meal</h2>
        
        {success ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600 font-bold text-xl">✓</div>
            <p className="text-sm font-sans text-ink-700 font-medium">Trial meal booked for tomorrow!</p>
            <p className="text-xs text-ink-500 mt-2 mb-6">Our team will contact you for payment (Cash on delivery available).</p>
            <Button className="w-full" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-sans text-ink-600 mb-4">
              Not sure yet? Try a single lunch delivery tomorrow to experience our food quality.
            </p>

            <label className="block text-xs font-semibold text-ink-700 mb-2 font-sans">Select Delivery Address</label>
            {addresses?.length > 0 ? (
              <select 
                value={addressId} 
                onChange={e => setAddressId(e.target.value)}
                className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans mb-6"
              >
                {addresses.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.label} - {a.line1}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-rose-600 mb-6 bg-rose-50 p-2 rounded">Please add an address first before booking a trial.</p>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={handleBook} isLoading={loading} disabled={!addressId || addresses?.length === 0}>
                Confirm Booking
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PauseDeliveryModal({ subscription, onClose, skipDay }: any) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handlePause = async () => {
    if (!date) return;
    try {
      // Calculate credit amount based on total daily value
      const dailyValue = subscription.pricePerDaySnapshot * (subscription.quantity || 1);
      
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date,
        mealTypes: ['breakfast', 'lunch', 'dinner'], // pausing the whole day
        reason: reason || 'Customer requested pause',
        creditAmount: dailyValue
      });
      onClose();
    } catch (err) {
      console.error('Failed to pause delivery:', err);
      alert('Failed to pause delivery.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">Pause Delivery</h2>
        <p className="text-sm font-sans text-ink-600 mb-4">
          Select a date to pause your delivery. You will receive a credit of ₹{subscription.pricePerDaySnapshot * (subscription.quantity || 1)} on your next month's bill.
        </p>

        <label className="block text-xs font-semibold text-ink-700 mb-1 font-sans">Select Date</label>
        <input 
          type="date" 
          value={date} 
          min={tomorrow}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans mb-4"
        />

        <label className="block text-xs font-semibold text-ink-700 mb-1 font-sans">Reason (Optional)</label>
        <input 
          type="text" 
          value={reason} 
          placeholder="e.g. Out of town"
          onChange={e => setReason(e.target.value)}
          className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans mb-6"
        />

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handlePause} isLoading={skipDay.isPending} disabled={!date}>Confirm Pause</Button>
        </div>
      </div>
    </div>
  );
}
