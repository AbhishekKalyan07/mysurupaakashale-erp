import { useState, useEffect } from "react";
import { PremiumModal } from "@/shared/components/ui/PremiumModal";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import {
  useUpdateSalaryAdvance,
  useAssignAdvancePeriod,
  useVoidSalaryAdvance,
} from "../hooks/usePayroll";
import type { SalaryAdvance, UserProfile } from "@/shared/types";
import { AlertTriangle } from "lucide-react";

interface EditAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  advance: SalaryAdvance | null;
  staff: UserProfile | null;
}

export function EditAdvanceModal({
  isOpen,
  onClose,
  advance,
  staff,
}: EditAdvanceModalProps) {
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState("");
  const [payrollMonth, setPayrollMonth] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);

  const updateAdvance = useUpdateSalaryAdvance();
  const assignPeriod = useAssignAdvancePeriod();
  const voidAdvance = useVoidSalaryAdvance();

  const isLegacy = advance?.payrollMonth === null;

  useEffect(() => {
    if (isOpen && advance) {
      setAmountStr(String(advance.amount));
      setDate(advance.date);
      setPayrollMonth(advance.payrollMonth || "");
      setReason(advance.reason);
      setNotes(advance.notes || "");
      setIsVoiding(false);
      setVoidReason("");
    }
  }, [isOpen, advance]);

  if (!advance || !staff) return null;

  // Cannot edit non-pending advances
  const isReadOnly = advance.status !== "pending";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (isLegacy) {
      // For legacy advances, we're ONLY allowing period assignment here for simplicity,
      // or we can allow full edit since updateAdvance covers it. We'll use updateAdvance
      // if they just edit everything. But assignPeriod is specific for just period.
      // We will just use updateAdvance for everything.
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert("Amount must be a positive number");
      return;
    }

    if (!payrollMonth.match(/^\d{4}-\d{2}$/)) {
      alert("Payroll month must be in YYYY-MM format.");
      return;
    }

    await updateAdvance.mutateAsync({
      advance,
      updates: { amount, date, payrollMonth, reason, notes },
    });

    onClose();
  };

  const handleVoid = async () => {
    if (!voidReason.trim()) {
      alert("Please provide a reason for voiding this advance.");
      return;
    }
    await voidAdvance.mutateAsync({ advance, voidReason });
    onClose();
  };

  if (isVoiding) {
    return (
      <PremiumModal
        isOpen={isOpen}
        onClose={onClose}
        title="Void Salary Advance"
      >
        <div className="space-y-4">
          <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg flex gap-3 text-danger items-start">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Warning</p>
              <p className="opacity-90">
                Voiding an advance permanently cancels it. This action cannot be
                undone. The record is kept for financial audit history.
              </p>
            </div>
          </div>

          <Input
            label="Reason for Voiding"
            type="text"
            required
            autoFocus
            placeholder="e.g. Added by mistake, requested cancellation"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />

          <div className="flex justify-end gap-3 mt-6 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setIsVoiding(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleVoid}
              isLoading={voidAdvance.isPending}
            >
              Confirm Void
            </Button>
          </div>
        </div>
      </PremiumModal>
    );
  }

  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Salary Advance Details"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Staff Member
          </label>
          <div className="p-3 bg-background-alt rounded-lg font-medium text-primary border border-border/50 flex justify-between">
            <span>{staff.fullName}</span>
            <span className="text-sm text-text-muted capitalize">
              {advance.status}
            </span>
          </div>
        </div>

        <Input
          label="Advance Amount (₹)"
          type="number"
          min="1"
          step="1"
          required
          disabled={isReadOnly}
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date Received"
            type="date"
            required
            disabled={isReadOnly}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Payroll Month (YYYY-MM)"
            type="month"
            required
            disabled={isReadOnly}
            value={payrollMonth}
            onChange={(e) => setPayrollMonth(e.target.value)}
            helperText={
              isLegacy
                ? "⚠ Unassigned Legacy Advance. Please assign a period."
                : undefined
            }
          />
        </div>

        <Input
          label="Reason"
          type="text"
          required
          disabled={isReadOnly}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <Input
          label="Notes"
          type="text"
          disabled={isReadOnly}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {advance.status === "voided" && advance.voidReason && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-medium">
            Void Reason: {advance.voidReason}
            <div className="text-xs opacity-70 mt-1">
              Voided by {advance.voidedByName || advance.voidedBy}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 border-t border-border/50 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant="danger"
                type="button"
                onClick={() => setIsVoiding(true)}
              >
                Void Advance
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={updateAdvance.isPending || assignPeriod.isPending}
              >
                Save Changes
              </Button>
            </>
          )}
        </div>
      </form>
    </PremiumModal>
  );
}
