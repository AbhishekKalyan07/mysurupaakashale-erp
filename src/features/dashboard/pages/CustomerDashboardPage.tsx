import { Timestamp } from 'firebase/firestore';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMySubscription, useSkipDay, useHasPastOrders, useSubscriptionStats } from '@/features/customer/hooks/useMySubscription';
import { useMealPlans } from '@/features/customer/hooks/useMealPlans';
import { useCustomerAddresses } from '@/features/customer/hooks/useCustomerAddresses';
import { useDeliveryPartnerProfile } from '@/features/delivery/hooks/useDeliveryPartnerProfile';
import type { CustomerProfile } from '@/shared/types';
import { useQueryClient } from '@tanstack/react-query';
import type { Order } from '@/shared/types';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { getTodayIST } from '@/shared/utils/dateUtils';
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
import { PauseSubscriptionModal } from '@/features/customer/components/PauseSubscriptionModal';
import { Truck, XCircle, PauseCircle } from 'lucide-react';
import { PauseDeliveryModal } from '@/features/customer/components/PauseDeliveryModal';
import { CancelTodayModal } from '@/features/customer/components/CancelTodayModal';

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
  const { firebaseUser, profile } = useAuth();
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
  const { data: subStats } = useSubscriptionStats(subscription?.id, firebaseUser?.uid);
  
  const customerProfile = profile as CustomerProfile | null;
  const { data: deliveryPartner } = useDeliveryPartnerProfile(customerProfile?.deliveryPartnerId);

  const today = getTodayIST();

  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const unsubscribe = orderRepository.subscribeToCustomerOrders(
      firebaseUser.uid,
      (orders) => setCustomerOrders(orders)
    );
    return () => unsubscribe();
  }, [firebaseUser?.uid]);

  const todayOrders = useMemo(() => {
    return customerOrders.filter(o => o.date === today);
  }, [customerOrders, today]);

  const accruedBill = useMemo(() => {
    if (!subscription?.id) return 0;
    return customerOrders
      .filter(o => o.subscriptionId === subscription.id && o.status === 'delivered')
      .reduce((sum, order) => sum + (order.price || 0), 0);
  }, [customerOrders, subscription?.id]);

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showCancelTodayModal, setShowCancelTodayModal] = useState(false);
  const [showSkipDayModal, setShowSkipDayModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const skipDay = useSkipDay();

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
            
            <div className="p-4 md:p-5">
              <h2 className="text-lg font-display font-bold text-primary mb-3 flex items-center gap-2">
                <UtensilsCrossed size={18} className="text-gold" /> Live Meal Subscription
              </h2>

              {subscription ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-background p-4 rounded-xl border border-primary/10 shadow-xs">
                    <div>
                      <h3 className="font-sans font-bold text-primary text-base flex items-center gap-2">
                        {selectedPlan?.name || 'Loading plan details...'}
                        <span className="text-[10px] text-primary font-bold bg-gold/20 px-2.5 py-0.5 rounded-full border border-gold/30">
                          {subscription.quantity || 1} {subscription.quantity === 1 ? 'Person' : 'People'}
                        </span>
                      </h3>
                      <p className="text-text-muted text-xs mt-1 font-medium">
                        Post-paid monthly • ₹{subscription.pricePerDaySnapshot * (subscription.quantity || 1)}/day
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <Badge variant={getStatusBadgeVariant(subscription.status)} className="capitalize font-sans px-3 py-1 font-bold text-[10px] tracking-wider">
                        {subscription.status.replace('_', ' ')}
                      </Badge>
                      <div className="bg-primary/5 border border-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-sans text-right shadow-xs flex sm:flex-col items-center sm:items-end gap-1 sm:gap-0">
                        <span className="font-bold text-text-muted text-[9px] uppercase tracking-wider">Accrued Bill:</span>
                        <strong className="text-sm font-bold font-data text-gold-dark">₹{accruedBill || 0}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 font-sans text-xs">
                    {/* Next Delivery info */}
                    <div className="space-y-2 bg-background p-3.5 rounded-xl border border-primary/10">
                      <span className="text-text-muted font-bold uppercase tracking-wider block text-[9px]">
                        Delivery Schedule &amp; Stats
                      </span>
                      <div className="flex items-start gap-2.5 text-primary">
                        <Calendar size={16} className="text-gold shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-primary text-xs">Starts: {subscription.startDate}</p>
                          <div className="text-text-muted mt-1 font-medium text-[11px] flex gap-3">
                            <span><strong className="text-primary">{subStats?.daysOrdered || 0}</strong> Delivered</span>
                            <span><strong className="text-primary">{subStats?.pausedDates?.length || 0}</strong> Pauses</span>
                          </div>
                          {subStats && subStats.pausedDates.length > 0 && (
                            <p className="text-[10px] text-text-muted mt-0.5 italic">Paused: {subStats.pausedDates.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2.5 text-primary mt-2 pt-2 border-t border-primary/5">
                        <Truck size={16} className="text-gold shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-primary text-xs">Delivery Partner</p>
                          <div className="text-text-muted mt-0.5 font-medium text-[11px]">
                            {deliveryPartner ? (
                              <span className="text-primary font-bold">{deliveryPartner.fullName}</span>
                            ) : (
                              <span className="italic">Unassigned</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Drop-off Address info */}
                    <div className="space-y-2 bg-background p-3.5 rounded-xl border border-primary/10">
                      <span className="text-text-muted font-bold uppercase tracking-wider block text-[9px]">
                        Drop-off Address
                      </span>
                      <div className="flex items-start gap-2.5 text-primary">
                        <MapPin size={16} className="text-gold shrink-0 mt-0.5" />
                        <div>
                          {activeAddress ? (
                            <>
                              <p className="font-bold text-primary text-xs">{activeAddress.label}</p>
                              <p className="text-text-muted mt-0.5 font-medium text-[11px] line-clamp-2">{activeAddress.line1}</p>
                            </>
                          ) : (
                            <p className="text-danger font-bold text-xs">Address details missing</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-primary/10 pt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowFeedbackModal(true)}
                      className="text-primary border-primary/20 hover:bg-gold/10 hover:text-gold hover:border-gold/30 font-bold text-xs"
                    >
                      Report Issue <MessageSquareWarning size={14} className="ml-1.5" />
                    </Button>
                    {subscription.status === 'paused' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowResumeModal(true)}
                        className="text-success border-success/30 hover:bg-success/10 font-bold text-xs"
                      >
                        Resume <Play size={14} className="ml-1.5 fill-current" />
                      </Button>
                    ) : subscription.status === 'active' ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowCancelTodayModal(true)}
                          className="text-danger border-danger/20 hover:bg-danger/10 hover:text-danger hover:border-danger/30 font-bold text-xs"
                        >
                          Cancel Today <XCircle size={14} className="ml-1.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowSkipDayModal(true)}
                          className="text-primary border-primary/20 hover:bg-primary/10 font-bold text-xs"
                        >
                          Skip a Day <Calendar size={14} className="ml-1.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowPauseModal(true)}
                          className="text-amber-800 border-amber-300 hover:bg-amber-50 font-bold text-xs"
                        >
                          Pause Subscription <PauseCircle size={14} className="ml-1.5" />
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate('/customer/subscription')}
                      className="font-bold text-xs"
                    >
                      Manage <ExternalLink size={14} className="ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 px-3 flex flex-col items-center justify-center bg-background rounded-xl border border-primary/10">
                  <h3 className="text-base font-display font-bold text-primary mb-1">Start Your Culinary Journey</h3>
                  <p className="text-text-muted font-sans text-xs mb-3 max-w-sm mx-auto leading-normal">
                    No active meal subscription. Discover our curated plans for authentic daily meals delivered to your door.
                  </p>
                  
                  <div className="flex flex-row gap-2 justify-center items-center w-full max-w-xs">
                    <Button
                      onClick={() => navigate('/customer/plans')}
                      size="sm"
                      className="font-sans font-bold text-xs px-4 py-2 flex-1 shadow-xs"
                    >
                      Explore Plans
                    </Button>
                    {hasPastOrders === false && (
                      <Button
                        variant="secondary"
                        onClick={() => setShowTrialModal(true)}
                        size="sm"
                        className="font-sans font-bold text-xs px-4 py-2 bg-white text-gold-dark border-gold/30 hover:bg-gold/5 shadow-xs flex-1"
                      >
                        Book Trial
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
                  Total: ₹{todayOrders.filter(o => o.status !== 'cancelled').reduce((sum, order) => sum + (order.price || 0), 0)}
                </span>
              )}
            </h3>
            {(() => {
              if (!todayOrders || todayOrders.length === 0) {
                return (
                  <div className="bg-background-alt border border-primary/10 rounded-xl p-6 text-center">
                    <p className="text-base font-sans text-text-muted font-medium">No deliveries scheduled for today.</p>
                  </div>
                );
              }
              
              const mealOrder = ['breakfast', 'lunch', 'dinner'];
              const grouped = todayOrders.reduce((acc, order) => {
                const mt = order.mealType || 'other';
                if (!acc[mt]) acc[mt] = [];
                acc[mt].push(order);
                return acc;
              }, {} as Record<string, typeof todayOrders>);
              
              return (
                <div className="relative border-l-2 border-gold/30 ml-3 pl-6 space-y-8 py-2">
                  {mealOrder.map((mealType) => {
                    const orders = grouped[mealType];
                    if (!orders || orders.length === 0) return null;
                    
                    return (
                      <div key={mealType} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-gold border-4 border-background shadow-sm" />
                        
                        <h4 className="font-bold text-base text-primary capitalize tracking-wide font-sans mb-3">
                          {mealType}
                        </h4>
                        
                        <div className="grid gap-3">
                          {orders.map((order) => (
                            <div key={order.id} className="p-4 rounded-xl border border-primary/10 bg-primary/5 shadow-sm space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold font-sans text-primary text-base capitalize">
                                    {order.itemsLabel || order.mealType}
                                  </p>
                                  {order.mealQuantity && order.mealQuantity > 1 && (
                                    <p className="text-xs text-gold-dark font-bold bg-gold/10 px-2 py-0.5 rounded border border-gold/20 inline-block mt-1">Qty: {order.mealQuantity}</p>
                                  )}
                                </div>
                                <Badge variant={getStatusBadgeVariant(order.status)} className="capitalize font-sans px-3 py-1 font-bold text-[10px] tracking-wider shrink-0">
                                  {order.status === 'delivered' ? '✔ Delivered' : order.status.replace('_', ' ')}
                                </Badge>
                              </div>

                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                {order.driverName ? (
                                  <div className="flex flex-col">
                                    <span className="text-text-faint text-[10px] font-bold uppercase tracking-wider">Driver</span>
                                    <span className="text-primary font-medium">{order.driverName}</span>
                                    {order.driverPhone && <span className="text-text-muted text-xs">{order.driverPhone}</span>}
                                  </div>
                                ) : (
                                  <div className="flex flex-col">
                                    <span className="text-text-faint text-[10px] font-bold uppercase tracking-wider">Location</span>
                                    <span className="text-text-muted font-medium">Kitchen / Processing</span>
                                  </div>
                                )}
                                
                                {order.estimatedETA && order.status !== 'delivered' && (
                                  <div className="flex flex-col">
                                    <span className="text-text-faint text-[10px] font-bold uppercase tracking-wider">ETA</span>
                                    <span className="text-gold-dark font-bold">{order.estimatedETA}</span>
                                  </div>
                                )}

                                {order.status === 'delivered' && order.updatedAt && (
                                  <div className="flex flex-col">
                                    <span className="text-text-faint text-[10px] font-bold uppercase tracking-wider">Delivered At</span>
                                    <span className="text-success-dark font-bold">
                                      {new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true }).format(order.updatedAt.toDate ? order.updatedAt.toDate() : new Date(order.updatedAt as any))}
                                    </span>
                                  </div>
                                )}

                                {order.billingStatus && (
                                  <div className="flex flex-col">
                                    <span className="text-text-faint text-[10px] font-bold uppercase tracking-wider">Billing</span>
                                    <span className="text-primary font-medium">{order.billingStatus}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>

          {/* Quick info panel */}
          <Card className="p-6 md:p-8 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10 flex gap-4 items-start shadow-sm">
            <Info className="text-gold shrink-0 mt-1" size={24} />
            <div className="font-sans text-primary text-sm w-full min-w-0">
              <h4 className="font-bold text-primary text-lg mb-3">Daily Delivery Times:</h4>
              <ul className="space-y-3 mt-2 bg-background p-4 rounded-xl border border-gold/20 shadow-sm">
                <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 pb-3 border-b border-primary/5">
                  <strong className="text-primary font-bold flex items-center gap-1.5">🌅 <span className="tracking-wide">Breakfast</span></strong>
                  <span className="text-text-muted font-data font-medium text-xs sm:text-sm bg-surface-2 px-2.5 py-1 rounded-md border border-border whitespace-nowrap self-start sm:self-auto">07:00 AM - 09:00 AM</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 pb-3 border-b border-primary/5">
                  <strong className="text-primary font-bold flex items-center gap-1.5">☀️ <span className="tracking-wide">Lunch</span></strong>
                  <span className="text-text-muted font-data font-medium text-xs sm:text-sm bg-surface-2 px-2.5 py-1 rounded-md border border-border whitespace-nowrap self-start sm:self-auto">12:30 PM - 02:30 PM</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
                  <strong className="text-primary font-bold flex items-center gap-1.5">🌙 <span className="tracking-wide">Dinner</span></strong>
                  <span className="text-text-muted font-data font-medium text-xs sm:text-sm bg-surface-2 px-2.5 py-1 rounded-md border border-border whitespace-nowrap self-start sm:self-auto">07:00 PM - 09:00 PM</span>
                </li>
              </ul>
              <p className="text-text-muted mt-4 text-xs font-medium leading-relaxed bg-primary/5 p-3 rounded-lg border border-primary/10">
                To cancel a specific meal, please do so before the cut-off time: Breakfast (5 AM), Lunch (10:30 AM), Dinner (4 PM).
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
                  aria-label="Add new address"
                  onClick={() => setShowAddressForm(true)}
                  className="text-gold-dark hover:text-gold-dark/80 text-xs font-sans font-bold flex items-center gap-1 transition-colors bg-gold/10 px-3 py-1.5 rounded-lg border border-gold/20"
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
                                aria-label={`Set ${addr.label} as default address`}
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
                          aria-label={`Delete ${addr.label} address`}
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

        {showCancelTodayModal && subscription && (
          <CancelTodayModal 
            subscription={subscription} 
            onClose={() => setShowCancelTodayModal(false)} 
            skipDay={skipDay}
          />
        )}

        {showSkipDayModal && subscription && (
          <PauseDeliveryModal 
            subscription={subscription} 
            onClose={() => setShowSkipDayModal(false)} 
            skipDay={skipDay}
          />
        )}

        {showPauseModal && subscription && (
          <PauseSubscriptionModal 
            subscription={subscription} 
            onClose={() => setShowPauseModal(false)} 
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
            profile={profile}
          />
        )}
      </div>
    </div>
  );
}

function TrialMealModal({ onClose, uid, addresses, plans, profile }: any) {
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
      
      const selectedAddress = addresses?.find((a: any) => a.id === addressId);
      const addressString = selectedAddress ? `${selectedAddress.line1} ${selectedAddress.line2 || ''}, ${selectedAddress.city}, ${selectedAddress.pincode}`.trim() : undefined;

      await setDoc(doc(db, 'orders', orderId), {
        id: orderId,
        displayId: `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        source: 'one_time',
        customerId: uid,
        customerName: profile?.fullName || 'Unknown Customer',
        customerCode: profile?.displayId,
        customerPhone: profile?.phone,
        address: addressString,
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
