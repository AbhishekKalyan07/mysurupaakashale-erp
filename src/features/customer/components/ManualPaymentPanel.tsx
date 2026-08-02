import { useState, useRef } from 'react';
import { useSubmitPayment } from '../hooks/usePayments';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { toast } from 'react-hot-toast';
import {
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  XCircle,
  CheckCircle,
} from 'lucide-react';
import type { PaymentMethod } from '@/shared/types';

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

interface PaymentFormData {
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentDate: string;
}

export function ManualPaymentPanel({
  subscriptionId,
  amount,
  onClose,
  onSuccess,
}: {
  subscriptionId: string;
  amount: number;
  onClose?: () => void;
  onSuccess?: () => void;
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
    upi: { label: 'UPI', icon: <Smartphone size={16} />, placeholder: 'UPI Transaction ID (e.g. 3109876543210)', needsScreenshot: true },
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
      if (onSuccess) onSuccess();
      if (onClose) onClose();
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
        {onClose && <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1 shrink-0"><XCircle size={18} /></button>}
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
          {onClose && <Button type="button" variant="secondary" className="flex-1 font-sans font-semibold" onClick={onClose} disabled={isBusy}>Cancel</Button>}
          <Button type="submit" className="flex-1 font-sans font-semibold" isLoading={isBusy}>
            {isBusy ? (isUploading ? 'Uploading…' : 'Submitting…') : <><CheckCircle size={16} className="mr-1" /> Submit Payment</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
