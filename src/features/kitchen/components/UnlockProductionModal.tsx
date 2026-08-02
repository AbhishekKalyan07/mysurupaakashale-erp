import { useEffect, useRef, useState } from 'react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { LockOpen, X } from 'lucide-react';


interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function UnlockProductionModal({ isOpen, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      console.error('Failed to unlock production:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-rice-200">
        <div className="flex items-center justify-between p-6 border-b border-rice-100">
          <h2 className="text-xl font-bold font-display text-ink-900">Unlock Production</h2>
          <button aria-label="Button action" onClick={onClose} className="text-ink-500 hover:text-ink-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-warning-subtle/30 text-warning rounded-full flex items-center justify-center shrink-0">
              <LockOpen size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900 font-display">Are you sure?</h3>
              <p className="text-sm text-ink-500 font-sans mt-1">
                Unlocking production allows kitchen staff to modify order statuses again. 
                This action will be recorded in the global audit log.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="unlock-reason" className="block text-sm font-bold text-ink-900 mb-1">
                Reason for unlocking <span className="text-danger">*</span>
              </label>
              <textarea
                id="unlock-reason"
                ref={inputRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Late addition, correcting a mistake..."
                className="w-full h-24 p-3 rounded-xl border border-rice-300 bg-white text-sm focus:ring-2 focus:ring-warning outline-none resize-none font-sans"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="bg-warning hover:bg-warning-hover text-white border-transparent"
                disabled={!reason.trim() || isSubmitting}
                isLoading={isSubmitting}
              >
                Unlock Production
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
