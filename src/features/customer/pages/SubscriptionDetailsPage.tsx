import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMySubscription } from '../hooks/useMySubscription';
import { useMealPlans } from '../hooks/useMealPlans';
import { useCustomerAddresses } from '../hooks/useCustomerAddresses';
import { useMyPayments } from '../hooks/usePayments';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useBusinessSettings } from '@/features/admin/hooks/useSettings';
import {
  Calendar,
  MapPin,
  Utensils,
  AlertTriangle,
  Play,
  Pause,
  Compass,
  XCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';

import { ManualPaymentPanel } from '../components/ManualPaymentPanel';
import { ResumeDeliveryModal } from '../components/ResumeDeliveryModal';

// ── Main Page ──────────────────────────────────────────────────────────────────
export function SubscriptionDetailsPage() {
  const { data: subscription, isLoading: isSubLoading, error: subError, refetch: refetchSub } = useMySubscription();
  const { data: plans, isLoading: isPlansLoading, error: plansError, refetch: refetchPlans } = useMealPlans();
  const { addresses } = useCustomerAddresses();
  const { data: payments } = useMyPayments();
  const { data: settings, isLoading: isSettingsLoading } = useBusinessSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pauseStartDate, setPauseStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [pauseEndDate, setPauseEndDate] = useState('');

  const isLoading = isSubLoading || isPlansLoading || isSettingsLoading;
  const hasError = subError || plansError;

  if (isLoading) return <LoadingScreen />;

  if (hasError) {
    return (
      <ErrorState
        title="Error loading details"
        description="We couldn't load your subscription details. Please try again."
        onRetry={() => { refetchSub(); refetchPlans(); }}
      />
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={<Compass size={40} className="text-ink-400" />}
          title="No Active Subscription"
          description="You don't have an active or pending meal plan subscription right now."
          action={
            <Button
              onClick={() => navigate('/customer/plans')}
              className="mt-4 uppercase tracking-wider font-semibold font-sans"
            >
              Browse Meal Plans
            </Button>
          }
        />
      </div>
    );
  }

  const selectedPlan = plans?.find((p) => p.id === subscription.planId);
  const selectedAddress = addresses?.find((addr) => addr.id === subscription.deliveryAddressId);
  const latestPayment = payments?.find((p) => p.status === 'pending' && p.subscriptionId === subscription.id);

  const handleLifecycleAction = async (action: 'resume' | 'cancel' | 'renew') => {
    if (action === 'cancel' && !confirm('Are you sure you want to cancel this subscription?')) return;
    
    setUpdating(true);
    try {
      await subscriptionRepository.update(subscription.id, {
        status: action === 'renew' ? 'pending_payment' :
                action === 'resume' ? 'active' : 
                'cancelled',
        ...(action === 'resume' ? { pauseStartDate: null, pauseEndDate: null } : {})
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(subscription.customerId),
      });
    } catch (err: unknown) {
      console.error('Failed to update subscription status:', err);
      toast.error((err as Error).message || 'Failed to update subscription.');
    } finally {
      setUpdating(false);
    }
  };

  const handlePauseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseStartDate) { toast.error('Start date is required'); return; }
    
    setUpdating(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const shouldPauseNow = pauseStartDate <= today;

      await subscriptionRepository.update(subscription.id, {
        status: shouldPauseNow ? 'paused' : 'active',
        pauseStartDate,
        pauseEndDate: pauseEndDate || null,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(subscription.customerId),
      });
      setShowPauseModal(false);
      toast.success(shouldPauseNow ? 'Subscription paused' : 'Pause scheduled successfully');
    } catch (err: unknown) {
      console.error('Failed to pause subscription:', err);
      toast.error((err as Error).message || 'Failed to pause subscription.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'neutral' | 'danger' => {
    switch (status) {
      case 'active': return 'success';
      case 'pending_payment': return 'warning';
      case 'paused': return 'neutral';
      case 'cancelled':
      case 'expired': return 'danger';
      default: return 'neutral';
    }
  };

  const estimatedMonthly = subscription.pricePerDaySnapshot * (subscription.quantity || 1) * 30;
  const securityDeposit = settings?.pricing.securityDepositAmount || 1000;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <span className="text-xs uppercase font-sans tracking-widest text-ink-500 font-semibold">
            Manage Subscription
          </span>
          <h1 className="text-3xl font-serif font-bold text-ink-900 mt-1">
            {selectedPlan?.name || 'Meal Plan Subscription'}
          </h1>
        </div>
        <Badge tone={subscription.status === 'pending_payment' && latestPayment ? 'info' : getStatusBadgeVariant(subscription.status)} className="capitalize font-sans text-sm px-3 py-1 font-semibold flex items-center gap-1.5">
          {subscription.status === 'pending_payment' && latestPayment ? <><Clock size={16} /> Approval Pending</> : subscription.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Pending Payment Banner */}
      {subscription.status === 'pending_payment' && (
        <>
          {latestPayment ? (
            <Card className="border-2 border-blue-400 bg-blue-50/50 p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-4">
                <Clock className="text-blue-600 shrink-0 mt-1" size={22} />
                <div>
                  <h2 className="text-ink-900 font-bold font-sans text-base">Payment Under Verification</h2>
                  <p className="text-ink-600 font-sans text-sm mt-1">
                    Your payment of <strong>₹{latestPayment.amount}</strong> via{' '}
                    <strong className="capitalize">{latestPayment.paymentMethod.replace('_', ' ')}</strong> is
                    being verified by our team. This usually takes up to 24 hours.
                  </p>
                </div>
              </div>
              <Badge tone="info" className="shrink-0 font-sans">Pending Verification</Badge>
            </Card>
          ) : (
            !showPaymentPanel && (
              <Card className="border-2 border-amber-500 bg-amber-50/50 p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-1" size={24} />
                  <div>
                    <h2 className="text-ink-900 font-bold font-sans text-lg">Initial Security Deposit Pending</h2>
                    <p className="text-ink-600 font-sans text-sm mt-1">
                      Your subscription is created. Please pay the initial security deposit of <strong>₹{securityDeposit}</strong> via UPI, cash, or bank transfer and submit the details below to activate your meal deliveries. Your monthly usage bills will be generated at the end of each month.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowPaymentPanel(true)}
                  className="w-full md:w-auto font-sans font-semibold uppercase tracking-wider text-xs px-6 py-3 shrink-0"
                >
                  Submit Payment Details
                </Button>
              </Card>
            )
          )}

          {showPaymentPanel && (
            <ManualPaymentPanel
              subscriptionId={subscription.id}
              amount={securityDeposit}
              onClose={() => setShowPaymentPanel(false)}
            />
          )}
        </>
      )}

      {/* Scheduled Pause Banner */}
      {subscription.pauseStartDate && (
        <Card className="border-2 border-emerald-400 bg-emerald-50/50 p-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Pause className="text-emerald-600 shrink-0 sm:mt-0" size={20} />
          <div>
            <h2 className="text-ink-900 font-bold font-sans text-sm">
              {subscription.status === 'paused' ? 'Subscription Paused' : 'Pause Scheduled'}
            </h2>
            <p className="text-ink-600 font-sans text-xs mt-0.5">
              {subscription.status === 'paused' 
                ? 'Your subscription is currently paused.' 
                : `Your subscription is scheduled to pause on ${subscription.pauseStartDate}.`}
              {subscription.pauseEndDate && (
                <span> Deliveries will automatically resume on the day after <strong>{subscription.pauseEndDate}</strong>.</span>
              )}
            </p>
          </div>
          <Button
            onClick={() => subscription.status === 'paused' ? setShowResumeModal(true) : handleLifecycleAction('resume')}
            disabled={updating}
            variant="secondary"
            className="w-full sm:w-auto sm:ml-auto text-xs px-4 py-2 font-sans font-semibold"
          >
            {subscription.status === 'paused' ? 'Resume Now' : 'Cancel Scheduled Pause'}
          </Button>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {/* Meal Choices */}
          <Card className="p-6 border-rice-300">
            <h3 className="text-ink-900 font-bold font-sans text-lg border-b border-rice-200 pb-3 mb-4 flex items-center gap-2">
              <Utensils className="text-emerald-600" size={20} /> Chosen Meal Preferences
            </h3>
            <div className="space-y-4">
              {subscription.mealPreferences.map((pref) => {
                const slot = selectedPlan?.mealSlots?.find((s) => s.mealType === pref.mealType);
                const option = slot?.options.find((o) => o.id === pref.selectedOptionId);

                return (
                  <div key={pref.mealType} className="flex gap-4 p-3 bg-rice-50 rounded-lg">
                    <span className="capitalize font-sans font-bold text-ink-700 min-w-[100px]">
                      {pref.mealType}
                    </span>
                    <div className="font-sans text-ink-600 text-sm">
                      {slot?.isCustomerSelectable ? (
                        option ? (
                          <div>
                            <span className="font-semibold text-ink-900">{option.label}</span>
                            <div className="text-ink-500 text-xs mt-1">
                              Includes: {option.items.join(', ')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-rose-600 font-semibold">Not Selected</span>
                        )
                      ) : (
                        <div>
                          <span className="font-semibold text-stone-950">Daily Rotating Menu</span>
                          <p className="text-ink-500 text-xs mt-1">
                            Different traditional dish published daily by the kitchen.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Delivery Address */}
          <Card className="p-6 border-rice-300">
            <h3 className="text-ink-900 font-bold font-sans text-lg border-b border-rice-200 pb-3 mb-4 flex items-center gap-2">
              <MapPin className="text-emerald-600" size={20} /> Delivery Address
            </h3>
            {selectedAddress ? (
              <div className="font-sans">
                <span className="font-semibold text-ink-900 px-2 py-0.5 bg-rice-100 rounded text-xs">
                  {selectedAddress.label}
                </span>
                <p className="text-ink-700 mt-2 text-sm">
                  {selectedAddress.line1}
                  {selectedAddress.line2 && `, ${selectedAddress.line2}`}
                </p>
                <p className="text-ink-700 text-sm">
                  {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}
                </p>
                <p className="text-xs text-ink-400 mt-3 flex items-center gap-1.5">
                  <Clock size={12} /> Zone Code: {subscription.zoneId || 'Unassigned'}
                </p>
              </div>
            ) : (
              <p className="text-ink-500 text-sm font-sans italic">
                Address details unavailable. Address ID: {subscription.deliveryAddressId}
              </p>
            )}
          </Card>
        </div>

        {/* Right column: Billing + Actions */}
        <div className="space-y-6">
          <Card className="p-6 border-rice-300 bg-rice-50/50">
            <h3 className="text-ink-900 font-bold font-sans text-lg border-b border-rice-200 pb-3 mb-4">
              Billing Summary
            </h3>
            <div className="space-y-3 font-sans text-sm">
              <div className="flex justify-between text-ink-600">
                <span>Plan price per day:</span>
                <span className="font-semibold text-ink-900">₹{subscription.pricePerDaySnapshot}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Billing cycle:</span>
                <span className="capitalize text-ink-900 font-semibold">{subscription.billingCycle}</span>
              </div>
              <div className="flex justify-between text-ink-600 items-center">
                <span>Start Date:</span>
                <span className="text-stone-950 font-semibold flex items-center gap-1">
                  <Calendar size={14} className="text-ink-400" /> {subscription.startDate}
                </span>
              </div>
              <div className="border-t border-rice-300 pt-3 flex justify-between font-bold text-stone-950 text-base">
                <span>Estimated usage per month:</span>
                <span>₹{estimatedMonthly}</span>
              </div>
              <div className="flex justify-between font-bold text-stone-950 text-base">
                <span>Security Deposit Paid:</span>
                <span>₹{securityDeposit}</span>
              </div>
            </div>
          </Card>

          {/* Actions */}
          {subscription.status !== 'pending_payment' && (
            <Card className="p-6 border-rice-300">
              <h3 className="text-ink-900 font-bold font-sans text-sm uppercase tracking-wider mb-4 text-ink-500">
                Actions
              </h3>
              <div className="space-y-3">
                {subscription.status === 'active' && (
                  <Button
                    onClick={() => setShowPauseModal(true)}
                    disabled={updating}
                    variant="secondary"
                    className="w-full justify-start gap-2.5 font-sans font-semibold py-2.5"
                  >
                    <Pause size={16} /> Pause Subscription
                  </Button>
                )}
                {subscription.status === 'paused' && (
                  <Button
                    onClick={() => setShowResumeModal(true)}
                    disabled={updating}
                    className="w-full justify-start gap-2.5 font-sans font-semibold py-2.5"
                  >
                    <Play size={16} /> Resume Subscription
                  </Button>
                )}
                {subscription.status !== 'cancelled' && subscription.status !== 'expired' && (
                  <Button
                    onClick={() => handleLifecycleAction('cancel')}
                    disabled={updating}
                    variant="secondary"
                    className="w-full justify-start gap-2.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 font-sans font-semibold py-2.5"
                  >
                    <XCircle size={16} /> Cancel Subscription
                  </Button>
                )}
                {(subscription.status === 'cancelled' || subscription.status === 'expired') && (
                  <Button
                    onClick={() => handleLifecycleAction('renew')}
                    disabled={updating}
                    className="w-full justify-start gap-2.5 font-sans font-semibold py-2.5"
                  >
                    <RotateCcw size={16} /> Renew Subscription
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Pause Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 relative">
            <button onClick={() => setShowPauseModal(false)} className="absolute top-4 right-4 text-ink-400 hover:text-ink-600">
              <XCircle size={20} />
            </button>
            <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">Pause Subscription</h2>
            <p className="text-ink-600 text-sm font-sans mb-6">Select the dates during which you want to pause your meal deliveries. Deliveries will automatically resume after the end date.</p>
            
            <form onSubmit={handlePauseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1.5 font-sans uppercase tracking-wider">Pause Start Date</label>
                <input
                  type="date"
                  value={pauseStartDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setPauseStartDate(e.target.value)}
                  className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1.5 font-sans uppercase tracking-wider">Pause End Date (Optional)</label>
                <input
                  type="date"
                  value={pauseEndDate}
                  min={pauseStartDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setPauseEndDate(e.target.value)}
                  className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-ink-500 mt-1">Leave empty to pause indefinitely.</p>
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="secondary" className="flex-1 font-sans" onClick={() => setShowPauseModal(false)}>Cancel</Button>
                <Button type="submit" className="flex-1 font-sans" isLoading={updating}>Confirm Pause</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showResumeModal && (
        <ResumeDeliveryModal
          subscription={subscription}
          onClose={() => setShowResumeModal(false)}
        />
      )}
    </div>
  );
}
