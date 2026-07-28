import { Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMySubscription, useSkipDay, useHasPastOrders, useSubscriptionAccruedBill } from '@/features/customer/hooks/useMySubscription';
import { useMealPlans } from '@/features/customer/hooks/useMealPlans';
import { useCustomerAddresses } from '@/features/customer/hooks/useCustomerAddresses';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { AddressPicker, type PickedAddress } from '@/features/customer/components/AddressPicker';
import {
  UtensilsCrossed,
  MapPin,
  Plus,
  Trash2,
  Calendar,
  ExternalLink,
  Info,
  MessageSquareWarning,
  Play
} from 'lucide-react';
import { FeedbackModal } from '@/features/customer/components/FeedbackModal';
import { ResumeDeliveryModal } from '@/features/customer/components/ResumeDeliveryModal';

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
  const { firebaseUser } = useAuth();
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

  const { data: hasPastOrders } = useHasPastOrders();
  const { data: accruedBill } = useSubscriptionAccruedBill(subscription?.id);

  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { timeZone: APP_CONFIG.timezone }).format(new Date());
  const { data: todayOrders } = useQuery({
    queryKey: ['customerTodayOrders', firebaseUser?.uid, today],
    queryFn: async () => {
      if (!firebaseUser?.uid) return [];
      return orderRepository.getCustomerOrdersByDate(firebaseUser.uid, today);
    },
    enabled: !!firebaseUser?.uid,
  });

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const { mutateAsync: skipDay } = useSkipDay();

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
      <div className="space-y-8">
        <HeroBanner userName="Customer" subtitle="Dashboard" />
        <ErrorState
          title="Could not load your dashboard"
          description="We had trouble retrieving your subscription details. Please try again."
          onRetry={() => {
            refetchSub();
            refetchPlans();
          }}
        />
      </div>
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
    } catch (err: unknown) {
      console.error('Error adding address:', err);
      setAddressError((err as Error).message || 'Could not add address. Please check inputs.');
    }
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'default' | 'danger' | 'info' => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending_payment':
        return 'warning';
      case 'paused':
        return 'info';
      case 'cancelled':
        return 'danger';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome & Header */}
      <HeroBanner 
        userName="Customer"
        subtitle="Manage your daily meals, subscription plans, and delivery options here."
      />

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Columns: Subscription Status & Summary */}
        <div className="md:col-span-2 space-y-8">
          {/* Live Subscription Card */}
          <Card className="p-0 border-primary/20 shadow-sm relative overflow-hidden bg-primary/5">
            {subscription && (
              <div className="absolute top-0 right-0 left-0 bg-gold h-1 shadow-[0_0_10px_rgba(212,175,55,0.5)]"></div>
            )}
            
            <div className="p-6 md:p-8">
              <h2 className="text-2xl font-display font-bold text-primary mb-6 flex items-center gap-3">
                <UtensilsCrossed size={24} className="text-gold" /> Live Meal Subscription
              </h2>

              {subscription ? (
                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 bg-background p-6 rounded-2xl border border-primary/10 shadow-sm">
                    <div>
                      <h3 className="font-sans font-bold text-primary text-lg flex items-center gap-3">
                        {selectedPlan?.name || 'Loading plan details...'}
                        <span className="text-xs text-primary font-bold bg-gold/20 px-3 py-1 rounded-full border border-gold/30">
                          {subscription.quantity || 1} {subscription.quantity === 1 ? 'Person' : 'People'}
                        </span>
                      </h3>
                      <p className="text-text-muted text-sm mt-2 font-medium">
                        Post-paid monthly billing • ₹{subscription.pricePerDaySnapshot * (subscription.quantity || 1)}/day total
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <Badge variant={getStatusBadgeVariant(subscription.status)} className="capitalize font-sans px-4 py-1.5 font-bold text-xs tracking-wider">
                        {subscription.status.replace('_', ' ')}
                      </Badge>
                      <div className="bg-primary/5 border border-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-sans text-right shadow-sm">
                        <span className="block font-bold text-text-muted mb-1 text-[10px] uppercase tracking-wider">Current Accrued Bill</span>
                        <strong className="text-lg font-bold font-data text-gold">₹{accruedBill || 0}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6 font-sans text-sm">
                    {/* Next Delivery info */}
                    <div className="space-y-3 bg-background p-5 rounded-xl border border-primary/10">
                      <span className="text-text-muted font-bold uppercase tracking-wider block text-[10px]">
                        Delivery Schedule
                      </span>
                      <div className="flex items-start gap-3 text-primary">
                        <Calendar size={18} className="text-gold shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-primary">Starts: {subscription.startDate}</p>
                          <p className="text-text-muted mt-1 font-medium text-xs">3 deliveries daily (Breakfast, Lunch, Dinner)</p>
                        </div>
                      </div>
                    </div>

                    {/* Drop-off Address info */}
                    <div className="space-y-3 bg-background p-5 rounded-xl border border-primary/10">
                      <span className="text-text-muted font-bold uppercase tracking-wider block text-[10px]">
                        Drop-off Address
                      </span>
                      <div className="flex items-start gap-3 text-primary">
                        <MapPin size={18} className="text-gold shrink-0 mt-0.5" />
                        <div>
                          {activeAddress ? (
                            <>
                              <p className="font-bold text-primary">{activeAddress.label}</p>
                              <p className="text-text-muted mt-1 font-medium text-xs line-clamp-1">{activeAddress.line1}</p>
                            </>
                          ) : (
                            <p className="text-danger font-bold">Address details missing</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-primary/10 pt-6 flex flex-wrap justify-end gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => setShowFeedbackModal(true)}
                      className="text-primary border-primary/20 hover:bg-gold/10 hover:text-gold hover:border-gold/30 font-bold"
                    >
                      Report Issue <MessageSquareWarning size={16} className="ml-2" />
                    </Button>
                    {subscription.status === 'paused' ? (
                      <Button
                        variant="secondary"
                        onClick={() => setShowResumeModal(true)}
                        className="text-success border-success/30 hover:bg-success/10 font-bold"
                      >
                        Resume Subscription <Play size={16} className="ml-2 fill-current" />
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setShowPauseModal(true)}
                        className="text-primary border-primary/20 hover:bg-primary/10 font-bold"
                      >
                        Pause Delivery <Calendar size={16} className="ml-2" />
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => navigate('/customer/subscription')}
                      className="font-bold"
                    >
                      Manage Subscription <ExternalLink size={16} className="ml-2" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 px-4 flex flex-col items-center justify-center bg-gradient-to-b from-transparent to-primary/5 rounded-3xl border border-primary/10 mt-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                  
                  <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm border border-primary/10 mb-4 relative z-10">
                    <UtensilsCrossed size={24} className="text-gold" />
                  </div>
                  
                  <h3 className="text-xl font-display font-bold text-primary mb-2 relative z-10">Start Your Culinary Journey</h3>
                  <p className="text-text-muted font-sans text-sm mb-6 max-w-sm mx-auto relative z-10 leading-relaxed">
                    You don't have an active meal subscription yet. Discover our curated plans and experience the taste of authentic home-style Karnataka meals delivered to your door.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full max-w-md relative z-10">
                    <Button
                      onClick={() => navigate('/customer/plans')}
                      className="font-sans font-bold uppercase tracking-wider text-[11px] px-6 py-2.5 w-full sm:w-auto shadow-md hover:shadow-lg transition-all"
                    >
                      Explore Meal Plans
                    </Button>
                    {hasPastOrders === false && (
                      <Button
                        variant="secondary"
                        onClick={() => setShowTrialModal(true)}
                        className="font-sans font-bold uppercase tracking-wider text-[11px] px-6 py-2.5 bg-white text-gold border-gold/30 hover:bg-gold/5 hover:border-gold/50 shadow-sm transition-all w-full sm:w-auto"
                      >
                        Book a Trial Meal
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Today's Deliveries Panel */}
          <Card className="p-6 md:p-8 border-primary/20 shadow-sm">
            <h3 className="text-xl font-display font-bold text-primary mb-6 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <Play size={20} className="text-gold fill-current" /> Today's Deliveries
              </span>
              {todayOrders && todayOrders.length > 0 && (
                <span className="text-xs font-sans font-bold text-gold bg-gold/10 border border-gold/20 px-3 py-1.5 rounded-lg shadow-sm">
                  Total: ₹{todayOrders.reduce((sum, order) => sum + (order.price || 0), 0)}
                </span>
              )}
            </h3>
            {todayOrders && todayOrders.length > 0 ? (
              <div className="space-y-4">
                {todayOrders.map((order) => (
                  <div key={order.id} className="flex justify-between items-center p-4 rounded-xl border border-primary/10 bg-primary/5 transition-all hover:bg-primary/10">
                    <div>
                      <p className="font-bold font-sans text-primary text-base capitalize">{order.mealType} - {order.itemsLabel || 'Meal'}</p>
                      <p className="text-sm text-text-muted mt-1 font-medium font-data">Price: ₹{order.price || 0}</p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(order.status)} className="capitalize font-sans px-3 py-1 font-bold text-xs tracking-wider">
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-background-alt border border-primary/10 rounded-xl p-6 text-center">
                <p className="text-base font-sans text-text-muted font-medium">No deliveries scheduled for today.</p>
              </div>
            )}
          </Card>

          {/* Quick info panel */}
          <Card className="p-6 md:p-8 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10 flex gap-4 items-start shadow-sm">
            <Info className="text-gold shrink-0 mt-1" size={24} />
            <div className="font-sans text-primary text-sm w-full">
              <h4 className="font-bold text-primary text-lg mb-3">Daily Delivery Times:</h4>
              <ul className="space-y-2 mt-2 bg-background p-4 rounded-xl border border-gold/20 shadow-sm">
                <li className="flex justify-between items-center"><strong className="text-primary font-bold">Breakfast:</strong> <span className="text-text-muted font-data font-medium">07:00 AM - 09:00 AM</span></li>
                <li className="flex justify-between items-center border-t border-primary/5 pt-2"><strong className="text-primary font-bold">Lunch:</strong> <span className="text-text-muted font-data font-medium">12:30 PM - 02:30 PM</span></li>
                <li className="flex justify-between items-center border-t border-primary/5 pt-2"><strong className="text-primary font-bold">Dinner:</strong> <span className="text-text-muted font-data font-medium">07:00 PM - 09:00 PM</span></li>
              </ul>
              <p className="text-text-muted mt-4 text-xs font-medium leading-relaxed bg-primary/5 p-3 rounded-lg border border-primary/10">
                To pause or skip deliveries for a single day, please visit your subscription details page before 10:00 PM the night prior.
              </p>
            </div>
          </Card>
        </div>

        {/* Right 1 Column: Saved Addresses */}
        <div className="space-y-6">
          <Card className="p-6 border-primary/20 shadow-sm">
            <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center justify-between border-b border-primary/10 pb-4">
              <span className="flex items-center gap-3">
                <MapPin size={20} className="text-gold" /> Saved Addresses
              </span>
              {!showAddressForm && (
                <button
                  onClick={() => setShowAddressForm(true)}
                  className="text-gold hover:text-gold/80 text-xs font-sans font-bold flex items-center gap-1 transition-colors bg-gold/10 px-3 py-1.5 rounded-lg border border-gold/20"
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </h2>

            {addressError && (
              <div className="p-3 mb-6 text-sm font-sans bg-danger/10 text-danger rounded-xl border border-danger/20 font-bold">
                {addressError}
              </div>
            )}

            {showAddressForm ? (
              /* Inline Address Form */
              <form onSubmit={handleSubmit(onAddressSubmit)} className="space-y-4 bg-background p-5 rounded-xl border border-primary/10 shadow-sm">
                <h3 className="font-sans font-bold text-primary text-xs uppercase tracking-widest mb-4">New Address</h3>

                {/* ── Zomato-style location picker ── */}
                <AddressPicker onPick={handleAddressPicked} />

                <div className="pt-4 border-t border-primary/10 mt-4 space-y-4">
                  <p className="text-[10px] text-text-muted font-sans font-bold uppercase tracking-wider">Confirm or edit the auto-filled details below</p>

                  <Input
                    label="Label (e.g. Home, Office)"
                    placeholder="Home"
                    {...register('label')}
                    error={errors.label?.message}
                  />

                  <Input
                    label="Street / House Number"
                    placeholder="123 Main St"
                    {...register('line1')}
                    error={errors.line1?.message}
                  />

                  <Input
                    label="Area / Landmark (Optional)"
                    placeholder="Opposite Park"
                    {...register('line2')}
                    error={errors.line2?.message}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Pincode"
                      placeholder="570001"
                      {...register('pincode')}
                      error={errors.pincode?.message}
                    />
                    <Input
                      label="City"
                      {...register('city')}
                      error={errors.city?.message}
                      disabled
                      className="bg-primary/5"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-primary/10 mt-6">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowAddressForm(false);
                      setPickedCoords(null);
                      reset();
                    }}
                    className="font-bold text-xs px-4 py-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isAdding}
                    className="font-bold text-xs px-6 py-2"
                  >
                    {isAdding ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Saved Address Cards */
              <div className="space-y-4">
                {addresses.length === 0 ? (
                  <div className="bg-background-alt border border-primary/10 rounded-xl p-6 text-center">
                    <p className="text-text-muted font-sans text-sm font-medium">
                      No saved addresses found. Add one to get started.
                    </p>
                  </div>
                ) : (
                  addresses.map((addr) => {
                    const isDefault = addr.id === defaultAddressId;
                    return (
                      <div
                        key={addr.id}
                        className={`group p-5 rounded-2xl border font-sans text-sm flex justify-between items-start transition-all duration-300 shadow-sm ${
                          isDefault ? 'border-gold bg-gold/5 shadow-gold/10' : 'border-primary/10 bg-white hover:border-primary/30 hover:shadow-md'
                        }`}
                      >
                        <div className="space-y-2 select-none pr-4">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="font-bold text-primary text-base font-display">{addr.label}</span>
                            {isDefault ? (
                              <span className="text-[9px] bg-gold text-white px-2.5 py-1 rounded-full font-sans font-bold uppercase tracking-wider shadow-sm">
                                Default
                              </span>
                            ) : (
                              <button
                                onClick={() => setDefaultAddress(addr.id)}
                                disabled={isSettingDefault}
                                className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-text-muted hover:text-gold text-[10px] font-bold uppercase tracking-wider transition-all bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10 hover:border-gold/30"
                              >
                                Set Default
                              </button>
                            )}
                          </div>
                          <p className="text-text-muted font-medium line-clamp-1">{addr.line1}</p>
                          {addr.line2 && <p className="text-text-muted font-medium line-clamp-1">{addr.line2}</p>}
                          <p className="text-primary font-bold text-xs mt-3 bg-primary/5 inline-block px-3 py-1.5 rounded-lg border border-primary/5 font-data">
                            {addr.city} • {addr.pincode}
                          </p>
                        </div>

                        <button
                          onClick={() => deleteAddress(addr.id)}
                          disabled={isDeleting}
                          className="text-text-muted hover:text-danger p-2 shrink-0 transition-colors hover:bg-danger/10 rounded-lg"
                          title="Delete address"
                        >
                          <Trash2 size={16} />
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

        {showResumeModal && subscription && (
          <ResumeDeliveryModal
            subscription={subscription}
            onClose={() => setShowResumeModal(false)}
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
  const queryClient = useQueryClient();

  const handleBook = async () => {
    if (!addressId || !uid) return;
    setLoading(true);
    try {
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
        createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp
      });

      await queryClient.invalidateQueries({ queryKey: ['hasPastOrders', uid] });
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to book trial meal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-primary/20">
        <h2 className="text-2xl font-bold font-display text-primary mb-4">Book Trial Meal</h2>
        
        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4 text-success font-bold text-2xl border border-success/30 shadow-sm">✓</div>
            <p className="text-lg font-sans text-primary font-bold">Trial meal booked for tomorrow!</p>
            <p className="text-sm text-text-muted mt-2 mb-8 font-medium">Our team will contact you for payment (Cash on delivery available).</p>
            <Button className="w-full font-bold" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-sans text-text-muted mb-6 font-medium leading-relaxed">
              Not sure yet? Try a single lunch delivery tomorrow to experience our food quality.
            </p>

            <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Select Delivery Address</label>
            {addresses?.length > 0 ? (
              <select 
                value={addressId} 
                onChange={e => setAddressId(e.target.value)}
                className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm"
              >
                {addresses.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.label} - {a.line1}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-danger mb-8 bg-danger/10 p-3 rounded-xl border border-danger/20 font-bold">Please add an address first before booking a trial.</p>
            )}

            <div className="flex gap-4">
              <Button variant="secondary" className="flex-1 font-bold" onClick={onClose}>Cancel</Button>
              <Button className="flex-1 font-bold" onClick={handleBook} isLoading={loading} disabled={!addressId || addresses?.length === 0}>
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
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-primary/20">
        <h2 className="text-2xl font-bold font-display text-primary mb-4">Pause Delivery</h2>
        <p className="text-sm font-sans text-text-muted mb-6 font-medium leading-relaxed bg-primary/5 p-4 rounded-xl border border-primary/10">
          Select a date to pause your delivery. You will receive a credit of <strong className="text-gold">₹{subscription.pricePerDaySnapshot * (subscription.quantity || 1)}</strong> on your next month's bill.
        </p>

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Select Date</label>
        <input 
          type="date" 
          value={date} 
          min={tomorrow}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-6 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm font-data"
        />

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">Reason (Optional)</label>
        <input 
          type="text" 
          value={reason} 
          placeholder="e.g. Out of town"
          onChange={e => setReason(e.target.value)}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm placeholder:text-text-muted/50"
        />

        <div className="flex gap-4">
          <Button variant="secondary" className="flex-1 font-bold" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 font-bold" onClick={handlePause} isLoading={skipDay.isPending} disabled={!date}>Confirm Pause</Button>
        </div>
      </div>
    </div>
  );
}
