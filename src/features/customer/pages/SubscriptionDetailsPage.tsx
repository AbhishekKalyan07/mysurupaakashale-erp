import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMySubscription } from '../hooks/useMySubscription';
import { useMealPlans } from '../hooks/useMealPlans';
import { useCustomerAddresses } from '../hooks/useCustomerAddresses';
import { useMyPayments, useSubmitPayment } from '../hooks/usePayments';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
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
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  CheckCircle,
} from 'lucide-react';
import type { PaymentMethod } from '@/shared/types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCurrentBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatBillingMonthLong(month: string) {
  try {
    const [year, mo] = month.split('-');
    return new Date(parseInt(year), parseInt(mo) - 1, 1).toLocaleString('en-IN', {
      month: 'long', year: 'numeric',
    });
  } catch {
    return month;
  }
}

// ── Manual Payment Form ───────────────────────────────────────────────────────
interface PaymentFormData {
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentDate: string;
}

function ManualPaymentPanel({
  subscriptionId,
  amount,
  onClose,
}: {
  subscriptionId: string;
  amount: number;
  onClose: () => void;
}) {
  const submitPayment = useSubmitPayment();
  const billingMonth = getCurrentBillingMonth();
  const billingLabel = formatBillingMonthLong(billingMonth);

  const [form, setForm] = useState<PaymentFormData>({
    paymentMethod: 'upi',
    referenceNumber: '',
    paymentDate: new Date().toISOString().split('T')[0],
  });

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const methodConfig: Record<PaymentMethod, { label: string; icon: React.ReactNode; placeholder: string; needsScreenshot: boolean }> = {
    upi: { label: 'UPI', icon: <Smartphone size={16} />, placeholder: 'UPI Transaction ID (e.g. 3109876543210)', needsScreenshot: false },
    cash: { label: 'Cash', icon: <Banknote size={16} />, placeholder: 'Cash receipt number (optional)', needsScreenshot: false },
    bank_transfer: { label: 'Bank Transfer', icon: <Building2 size={16} />, placeholder: 'UTR / Reference number', needsScreenshot: false },
  };

  const needsScreenshot = methodConfig[form.paymentMethod].needsScreenshot;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Screenshot must be under 5 MB.'); return; }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsScreenshot && !screenshotFile) { toast.error('Please upload a screenshot of your payment.'); return; }
    if (form.paymentMethod !== 'cash' && !form.referenceNumber.trim()) { toast.error('Please enter the transaction reference number.'); return; }

    try {
      setIsUploading(true);
      let screenshotUrl: string | null = null;
      if (screenshotFile) {
        // dynamic import so it doesn't break SSR/bundle if unused
        const { uploadPaymentScreenshot } = await import('@/shared/services/storage/uploadPaymentScreenshot');
        screenshotUrl = await uploadPaymentScreenshot(screenshotFile);
      }

      await submitPayment.mutateAsync({
        subscriptionId,
        amount,
        paymentMethod: form.paymentMethod,
        referenceNumber: form.referenceNumber.trim() || null,
        paymentDate: form.paymentDate,
        screenshotUrl,
        billingMonth,
      });
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Could not submit payment. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const isBusy = isUploading || submitPayment.isPending;

  return (
    <Card className="border-2 border-amber-400 bg-amber-50/60 p-6 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <CreditCard className="text-amber-600 shrink-0 mt-0.5" size={22} />
          <div>
            <h3 className="font-bold text-ink-900 font-sans text-base">Submit Advance Payment</h3>
            <p className="text-ink-600 font-sans text-sm mt-1">
              Advance for <span className="font-bold text-amber-800">{billingLabel}</span>
              {' '}— <span className="font-bold text-stone-950">₹{amount.toLocaleString('en-IN')}</span>
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1 shrink-0"><XCircle size={18} /></button>
      </div>

      {/* Bank details */}
      <div className="bg-white border border-rice-300 rounded-lg p-4 mb-5 text-sm font-sans">
        <h4 className="font-bold text-ink-800 mb-2 text-xs uppercase tracking-wider">Our Payment Details</h4>
        <div className="grid grid-cols-2 gap-y-1 text-ink-600 text-xs">
          <span className="font-semibold">UPI ID:</span><span className="font-mono">mysuru.paakashale@upi</span>
          <span className="font-semibold">Account Name:</span><span>Mysuru Paakashale</span>
          <span className="font-semibold">Bank:</span><span>State Bank of India</span>
          <span className="font-semibold">Account No:</span><span className="font-mono">XXXX-XXXX-1234</span>
          <span className="font-semibold">IFSC:</span><span className="font-mono">SBIN0012345</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Payment method */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-2 font-sans uppercase tracking-wider">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(methodConfig) as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, paymentMethod: method }));
                  if (method === 'cash') { setScreenshotFile(null); setScreenshotPreview(null); }
                }}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-xs font-semibold font-sans transition-all ${
                  form.paymentMethod === method
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                    : 'border-rice-300 text-ink-600 hover:border-ink-400 bg-white'
                }`}
              >
                {methodConfig[method].icon}
                {methodConfig[method].label}
              </button>
            ))}
          </div>
        </div>

        {/* Cash note */}
        {form.paymentMethod === 'cash' && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <Banknote size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-sans text-amber-700">
              For cash payments, hand the amount directly to our staff or delivery partner and enter the receipt number below. Our team will confirm manually.
            </p>
          </div>
        )}

        {/* Screenshot upload */}
        {needsScreenshot && (
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-2 font-sans uppercase tracking-wider">
              Payment Screenshot <span className="text-red-500">*</span>
            </label>
            {screenshotPreview ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-emerald-400 bg-emerald-50">
                <img src={screenshotPreview} alt="Payment proof" className="w-full max-h-52 object-contain" />
                <button
                  type="button"
                  onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }}
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
                ><XCircle size={14} /></button>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-t border-emerald-200">
                  <CheckCircle size={13} className="text-emerald-600" />
                  <span className="text-xs font-sans text-emerald-700 font-medium">{screenshotFile?.name}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-rice-400 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all cursor-pointer"
              >
                <span className="text-sm font-semibold font-sans text-ink-700">Click to Upload Screenshot</span>
                <span className="text-xs text-ink-400 font-sans">JPG, PNG, WebP — max 5 MB</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}

        {/* Reference number */}
        <Input
          label={`${methodConfig[form.paymentMethod].label} Reference${form.paymentMethod === 'cash' ? ' (Optional)' : ''}`}
          placeholder={methodConfig[form.paymentMethod].placeholder}
          value={form.referenceNumber}
          onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
        />

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1.5 font-sans uppercase tracking-wider">Date of Payment</label>
          <input
            type="date"
            value={form.paymentDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
            className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1 font-sans font-semibold" onClick={onClose} disabled={isBusy}>Cancel</Button>
          <Button type="submit" className="flex-1 font-sans font-semibold" isLoading={isBusy}>
            {isBusy ? (isUploading ? 'Uploading…' : 'Submitting…') : <><CheckCircle size={16} className="mr-1" /> Submit Payment</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}

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

  const handleLifecycleAction = async (action: 'pause' | 'resume' | 'cancel' | 'renew') => {
    if (action === 'cancel' && !confirm('Are you sure you want to cancel this subscription?')) return;
    
    setUpdating(true);
    try {
      // Phase 5: Client-side subscription lifecycle update.
      // 'renew' intentionally goes to 'pending_payment', not 'active' —
      // a lapsed/cancelled subscription needs a fresh verified payment
      // before deliveries resume, same as a brand-new subscription does.
      // (Bug fix: this used to jump straight to 'active' for free.)
      await subscriptionRepository.update(subscription.id, {
        status: action === 'renew' ? 'pending_payment' :
                action === 'resume' ? 'active' : 
                action === 'pause' ? 'paused' : 
                'cancelled'
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
                    onClick={() => handleLifecycleAction('pause')}
                    disabled={updating}
                    variant="secondary"
                    className="w-full justify-start gap-2.5 font-sans font-semibold py-2.5"
                  >
                    <Pause size={16} /> Pause Subscription
                  </Button>
                )}
                {subscription.status === 'paused' && (
                  <Button
                    onClick={() => handleLifecycleAction('resume')}
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
    </div>
  );
}
