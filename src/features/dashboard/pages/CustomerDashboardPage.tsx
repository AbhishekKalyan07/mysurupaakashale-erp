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
import {
  UtensilsCrossed,
  MapPin,
  Plus,
  Trash2,
  Calendar,
  ExternalLink,
  Info
} from 'lucide-react';

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
  const [addressError, setAddressError] = useState<string | null>(null);

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
        lat: null,
        lng: null,
      });
      setShowAddressForm(false);
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
        <p className="text-stone-600 font-sans text-sm mt-1">
          Manage your daily meals, subscription plans, and delivery options here.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Columns: Subscription Status & Summary */}
        <div className="md:col-span-2 space-y-8">
          {/* Live Subscription Card */}
          <Card className="p-6 md:p-8 border-stone-200 shadow-sm relative overflow-hidden bg-stone-50/20">
            {subscription && (
              <div className="absolute top-0 right-0 left-0 bg-emerald-700/5 h-1"></div>
            )}
            <h2 className="text-xl font-serif font-bold text-stone-900 mb-6 flex items-center gap-2.5">
              <UtensilsCrossed size={20} className="text-emerald-700" /> Live Meal Subscription
            </h2>

            {subscription ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-stone-50 p-4 rounded-xl border border-stone-100">
                  <div>
                    <h3 className="font-sans font-bold text-stone-900 text-base">
                      {selectedPlan?.name || 'Loading plan details...'}
                    </h3>
                    <p className="text-stone-500 text-xs mt-0.5">
                      Billed monthly • ₹{subscription.pricePerDaySnapshot}/day
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
                    <span className="text-stone-400 font-bold uppercase tracking-wider block text-[10px]">
                      Delivery Schedule
                    </span>
                    <div className="flex items-start gap-2.5 text-stone-700">
                      <Calendar size={16} className="text-stone-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-stone-900">Starts: {subscription.startDate}</p>
                        <p className="text-stone-500 mt-0.5">3 deliveries daily (Breakfast, Lunch, Dinner)</p>
                      </div>
                    </div>
                  </div>

                  {/* Drop-off Address info */}
                  <div className="space-y-2">
                    <span className="text-stone-400 font-bold uppercase tracking-wider block text-[10px]">
                      Drop-off Address
                    </span>
                    <div className="flex items-start gap-2.5 text-stone-700">
                      <MapPin size={16} className="text-stone-400 shrink-0 mt-0.5" />
                      <div>
                        {activeAddress ? (
                          <>
                            <p className="font-semibold text-stone-900">{activeAddress.label}</p>
                            <p className="text-stone-500 mt-0.5 line-clamp-1">{activeAddress.line1}</p>
                          </>
                        ) : (
                          <p className="text-rose-600 font-medium">Address details missing</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-stone-100 pt-5 flex justify-end">
                  <Button
                    onClick={() => navigate('/customer/subscription')}
                    className="font-sans font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5"
                    variant="secondary"
                  >
                    View details & Preferences <ExternalLink size={13} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-stone-500 font-sans text-sm mb-5">
                  You do not have an active breakfast, lunch, or dinner meal subscription yet.
                </p>
                <Button
                  onClick={() => navigate('/customer/plans')}
                  className="font-sans font-semibold uppercase tracking-wider text-xs px-6"
                >
                  Browse Meal Plans
                </Button>
              </div>
            )}
          </Card>

          {/* Quick info panel */}
          <Card className="p-5 border-stone-200 bg-amber-50/20 flex gap-3.5 items-start">
            <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div className="font-sans text-stone-700 text-xs">
              <h4 className="font-bold text-amber-950">Daily Delivery Times:</h4>
              <ul className="list-disc list-inside mt-2 space-y-1 pl-1 text-stone-600">
                <li><strong>Breakfast:</strong> 07:00 AM - 09:00 AM</li>
                <li><strong>Lunch:</strong> 12:30 PM - 02:30 PM</li>
                <li><strong>Dinner:</strong> 07:00 PM - 09:00 PM</li>
              </ul>
              <p className="text-stone-400 mt-3 text-[10px]">
                To pause or skip deliveries for a single day, please visit your subscription details page before 10:00 PM the night prior.
              </p>
            </div>
          </Card>
        </div>

        {/* Right 1 Column: Saved Addresses */}
        <div className="space-y-6">
          <Card className="p-6 border-stone-200">
            <h2 className="text-lg font-serif font-bold text-stone-900 mb-4 flex items-center justify-between">
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
              <form onSubmit={handleSubmit(onAddressSubmit)} className="space-y-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <h3 className="font-sans font-bold text-stone-800 text-xs uppercase tracking-wider mb-2">New Address</h3>

                <Input
                  label="Label (e.g. Home, Office)"
                  placeholder="Home"
                  {...register('label')}
                  error={errors.label?.message}
                  className="py-1 text-xs"
                />

                <Input
                  label="Street / House Number"
                  placeholder="123 Main St"
                  {...register('line1')}
                  error={errors.line1?.message}
                  className="py-1 text-xs"
                />

                <Input
                  label="Area / Landmark (Optional)"
                  placeholder="Opposite Park"
                  {...register('line2')}
                  error={errors.line2?.message}
                  className="py-1 text-xs"
                />

                <div className="grid grid-cols-2 gap-2">
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
                    className="py-1 text-xs bg-stone-100"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowAddressForm(false);
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
                  <p className="text-stone-400 font-sans text-xs italic py-4 text-center">
                    No saved addresses found. Add one to get started.
                  </p>
                ) : (
                  addresses.map((addr) => {
                    const isDefault = addr.id === defaultAddressId;
                    return (
                      <div
                        key={addr.id}
                        className={`p-3 rounded-lg border font-sans text-xs flex justify-between items-start ${
                          isDefault ? 'border-emerald-600 bg-emerald-50/5' : 'border-stone-200'
                        }`}
                      >
                        <div className="space-y-1 select-none pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-stone-800">{addr.label}</span>
                            {isDefault ? (
                              <span className="text-[9px] bg-emerald-600 text-stone-50 px-1 py-0.2 rounded font-sans font-bold uppercase tracking-wider">
                                Default
                              </span>
                            ) : (
                              <button
                                onClick={() => setDefaultAddress(addr.id)}
                                disabled={isSettingDefault}
                                className="text-stone-400 hover:text-emerald-700 text-[10px] underline"
                              >
                                Set Default
                              </button>
                            )}
                          </div>
                          <p className="text-stone-600 line-clamp-1">{addr.line1}</p>
                          {addr.line2 && <p className="text-stone-500 line-clamp-1">{addr.line2}</p>}
                          <p className="text-stone-700 font-medium">
                            {addr.city} - {addr.pincode}
                          </p>
                        </div>

                        <button
                          onClick={() => deleteAddress(addr.id)}
                          disabled={isDeleting}
                          className="text-stone-400 hover:text-rose-600 p-1 shrink-0 transition-colors"
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
      </div>
    </div>
  );
}
