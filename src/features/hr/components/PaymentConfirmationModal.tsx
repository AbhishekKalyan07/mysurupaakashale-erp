import { useState, useEffect } from 'react';
import { PremiumModal } from '@/shared/components/ui/PremiumModal';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { usePendingAdvances, usePaySalary } from '../hooks/usePayroll';
import type { PayrollRecord, UserProfile } from '@/shared/types';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: UserProfile | null;
  payrollRecord: PayrollRecord | null;
}

export function PaymentConfirmationModal({ isOpen, onClose, staff, payrollRecord }: PaymentConfirmationModalProps) {
  const [otherAdjustmentsStr, setOtherAdjustmentsStr] = useState('0');
  const [amountPaidStr, setAmountPaidStr] = useState('');
  
  const { data: pendingAdvances, isLoading } = usePendingAdvances(staff?.id || '');
  const paySalary = usePaySalary();

  useEffect(() => {
    if (payrollRecord && pendingAdvances) {
      const totalAdvance = pendingAdvances.reduce((acc, adv) => acc + adv.amount, 0);
      const suggested = payrollRecord.netSalary - totalAdvance;
      if (amountPaidStr === '') {
        setAmountPaidStr(String(suggested));
      }
    }
  }, [payrollRecord, pendingAdvances, amountPaidStr]);

  if (!staff || !payrollRecord) return null;

  if (isLoading) {
    return (
      <PremiumModal isOpen={isOpen} onClose={onClose} title="Payment Confirmation Summary">
        <div className="h-40 relative"><LoadingScreen /></div>
      </PremiumModal>
    );
  }

  const advances = pendingAdvances || [];
  const totalAdvance = advances.reduce((acc, adv) => acc + adv.amount, 0);
  const otherAdjustments = parseFloat(otherAdjustmentsStr) || 0;
  const suggestedPayable = payrollRecord.netSalary - totalAdvance + otherAdjustments;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountPaid = parseFloat(amountPaidStr);
    
    if (isNaN(amountPaid) || amountPaid < 0) {
      alert('Amount must be a non-negative number');
      return;
    }

    const advanceIds = advances.map(a => a.id);

    await paySalary.mutateAsync({
      payrollId: payrollRecord.id,
      amountPaid,
      advanceDeduction: totalAdvance,
      otherAdjustments,
      advancesToDeduct: advanceIds,
    });
    
    onClose();
  };

  return (
    <PremiumModal isOpen={isOpen} onClose={onClose} title="Payment Confirmation Summary">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-background-alt p-4 rounded-xl space-y-2 border border-border/50 font-data">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-text-secondary">Employee:</span>
            <span className="text-primary">{staff.fullName} ({staff.displayId || 'EMP'})</span>
          </div>
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-text-secondary">Payroll Period:</span>
            <span className="text-primary">{payrollRecord.month}</span>
          </div>
        </div>

        <div className="space-y-3 font-data text-sm">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Calculated Salary (Net)</span>
            <span className="font-semibold text-primary">₹{payrollRecord.netSalary.toLocaleString()}</span>
          </div>
          
          {advances.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-warning">Salary Advances ({advances.length})</span>
              <span className="font-semibold text-warning">-₹{totalAdvance.toLocaleString()}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-text-secondary whitespace-nowrap">Other Adjustment (₹)</span>
            <Input 
              type="number"
              value={otherAdjustmentsStr}
              onChange={e => setOtherAdjustmentsStr(e.target.value)}
              className="w-32 text-right !py-1"
              placeholder="+/- Amount"
            />
          </div>

          <div className="border-t border-border/50 pt-3 flex justify-between items-center">
            <span className="text-text-primary font-bold">Suggested Payable</span>
            <span className="font-bold text-primary text-base">₹{suggestedPayable.toLocaleString()}</span>
          </div>
        </div>

        <div className="pt-2">
          <Input 
            label="Amount Actually Paid (₹)"
            type="number"
            min="0"
            step="1"
            required
            value={amountPaidStr}
            onChange={(e) => setAmountPaidStr(e.target.value)}
            className="text-lg font-bold font-data"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" isLoading={paySalary.isPending}>Confirm Payment</Button>
        </div>
      </form>
    </PremiumModal>
  );
}
