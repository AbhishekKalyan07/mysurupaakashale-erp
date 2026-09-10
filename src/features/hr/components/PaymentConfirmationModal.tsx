import { useState, useEffect } from "react";
import { PremiumModal } from "@/shared/components/ui/PremiumModal";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import {
  usePendingAdvancesByPeriod,
  useAllAdvancesByStaff,
  usePaySalary,
} from "../hooks/usePayroll";
import type { PayrollRecord, UserProfile } from "@/shared/types";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { AlertTriangle } from "lucide-react";

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: UserProfile | null;
  payrollRecord: PayrollRecord | null;
}

export function PaymentConfirmationModal({
  isOpen,
  onClose,
  staff,
  payrollRecord,
}: PaymentConfirmationModalProps) {
  const [otherAdjustmentsStr, setOtherAdjustmentsStr] = useState("0");
  const [amountPaidStr, setAmountPaidStr] = useState("");

  // Only fetch advances specifically scoped to this exact payroll period
  const { data: periodAdvances, isLoading: isLoadingAdvances } =
    usePendingAdvancesByPeriod(staff?.id, payrollRecord?.month);

  // Fetch all advances to detect legacy/unassigned advances that might need attention
  const { data: allAdvances, isLoading: isLoadingAll } = useAllAdvancesByStaff(
    staff?.id,
  );
  const isLoading = isLoadingAdvances || isLoadingAll;

  const paySalary = usePaySalary();

  // 🔴 PAYMENT MODAL STATE LEAK FIX: Reset everything when modal opens for a new staff/payroll
  useEffect(() => {
    if (isOpen) {
      setOtherAdjustmentsStr("0");
      setAmountPaidStr("");
    }
  }, [isOpen, staff?.id, payrollRecord?.id]);

  const advances = periodAdvances || [];
  const totalAdvance = advances.reduce((acc, adv) => acc + adv.amount, 0);
  const otherAdjustments = parseFloat(otherAdjustmentsStr) || 0;
  // Use netSalary as the base (this contains the standard deductions like unpaid leave)
  const suggestedPayable =
    (payrollRecord?.netSalary || 0) - totalAdvance + otherAdjustments;

  // Initialize amountPaidStr only once per open cycle, after advances load
  useEffect(() => {
    if (isOpen && payrollRecord && periodAdvances && amountPaidStr === "") {
      setAmountPaidStr(String(suggestedPayable));
    }
  }, [isOpen, payrollRecord, periodAdvances, amountPaidStr, suggestedPayable]);

  if (!staff || !payrollRecord) return null;

  if (isLoading) {
    return (
      <PremiumModal
        isOpen={isOpen}
        onClose={onClose}
        title="Payment Confirmation Summary"
      >
        <div className="h-40 relative">
          <LoadingScreen />
        </div>
      </PremiumModal>
    );
  }

  // Detect unassigned/legacy advances
  const hasLegacyAdvances = (allAdvances || []).some(
    (a) =>
      a.status === "pending" &&
      (a.payrollMonth === null || a.payrollMonth === undefined),
  );

  // Detect advances from other periods
  const hasOtherPeriodAdvances = (allAdvances || []).some(
    (a) =>
      a.status === "pending" &&
      a.payrollMonth &&
      a.payrollMonth !== payrollRecord.month,
  );

  const amountPaid = parseFloat(amountPaidStr);
  const isAmountOverridden =
    !isNaN(amountPaid) && amountPaid !== suggestedPayable;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNaN(amountPaid) || amountPaid < 0) {
      alert("Amount must be a non-negative number");
      return;
    }

    if (isAmountOverridden) {
      const confirmOverride = window.confirm(
        `The Actual Amount Paid (₹${amountPaid.toLocaleString()}) differs from the Suggested Payable (₹${suggestedPayable.toLocaleString()}).\n\nDo you want to proceed with this payment?`,
      );
      if (!confirmOverride) return;
    }

    const advanceIds = advances.map((a) => a.id);

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
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Confirmation Summary"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-background-alt p-4 rounded-xl space-y-2 border border-border/50 font-data">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-text-secondary">Employee:</span>
            <span className="text-primary">
              {staff.fullName} ({staff.displayId || "EMP"})
            </span>
          </div>
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-text-secondary">Payroll Period:</span>
            <span className="text-primary">{payrollRecord.month}</span>
          </div>
        </div>

        {hasLegacyAdvances && (
          <div className="bg-warning/10 border border-warning/20 p-3 rounded-lg flex gap-3 text-warning items-start">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Unassigned Advances Detected</p>
              <p className="opacity-90">
                This employee has pending salary advances from the legacy system
                without an assigned payroll month. They will NOT be deducted
                here. Please assign a period in Salary Advances History.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 font-data text-sm">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Calculated Salary (Net)</span>
            <span className="font-semibold text-primary">
              ₹{payrollRecord.netSalary.toLocaleString()}
            </span>
          </div>

          {advances.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-warning">
                Advances for {payrollRecord.month} ({advances.length})
              </span>
              <span className="font-semibold text-warning">
                -₹{totalAdvance.toLocaleString()}
              </span>
            </div>
          )}

          {hasOtherPeriodAdvances && advances.length === 0 && (
            <div className="text-[10px] text-text-muted italic px-1">
              (Employee has advances pending for other months)
            </div>
          )}

          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-text-secondary whitespace-nowrap">
              Other Adjustment (₹)
            </span>
            <Input
              type="number"
              value={otherAdjustmentsStr}
              onChange={(e) => setOtherAdjustmentsStr(e.target.value)}
              className="w-32 text-right !py-1"
              placeholder="+/- Amount"
            />
          </div>

          <div className="border-t border-border/50 pt-3 flex justify-between items-center">
            <span className="text-text-primary font-bold">
              Suggested Payable
            </span>
            <span className="font-bold text-primary text-base">
              ₹{suggestedPayable.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <Input
            label="Actual Amount Paid (₹)"
            type="number"
            min="0"
            step="1"
            required
            value={amountPaidStr}
            onChange={(e) => setAmountPaidStr(e.target.value)}
            className={`text-lg font-bold font-data ${isAmountOverridden ? "!border-warning !text-warning" : ""}`}
            helperText={
              isAmountOverridden
                ? "Warning: Amount differs from suggested payable"
                : ""
            }
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={paySalary.isPending}
          >
            Confirm Payment
          </Button>
        </div>
      </form>
    </PremiumModal>
  );
}
